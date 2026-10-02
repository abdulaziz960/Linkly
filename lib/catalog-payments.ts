import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { getMerchantGatewayKeyForVerification, restockOrderUnits, type OrderStatus } from "./catalog";
import { sendWhatsAppTextMessage } from "./whatsapp-send";

/**
 * Payments for catalog orders go through the MERCHANT'S OWN Moyasar
 * account, never Linkly's (lib/moyasar.ts is the platform's own account for
 * subscriptions). The money settles straight to the merchant; Linkly only
 * creates the payment link with the merchant's key and later asks Moyasar
 * (with that same key) whether it was paid. That keeps this separate from
 * the platform client on purpose: different key, different metadata, and no
 * "Linkly" branding on the merchant's customer's invoice.
 */

function authorization(secretKey: string) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

export type MerchantInvoice = { id: string; url: string };

export async function createMerchantInvoice(input: {
  secretKey: string;
  amount: number;
  description: string;
  callbackUrl: string;
  successUrl: string;
  backUrl: string;
  metadata: Record<string, string>;
}): Promise<MerchantInvoice> {
  const response = await fetch("https://api.moyasar.com/v1/invoices", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: authorization(input.secretKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(input.amount * 100),
      currency: "SAR",
      description: input.description.slice(0, 250),
      callback_url: input.callbackUrl,
      success_url: input.successUrl,
      back_url: input.backUrl,
      metadata: input.metadata
    })
  });
  const payload = await response.json().catch(() => null) as { id?: string; url?: string; message?: string } | null;
  if (!response.ok || !payload?.id || !payload.url) {
    // The merchant's key/account problem, never logged with the key itself.
    console.error("Merchant Moyasar invoice creation failed", { status: response.status, message: payload?.message });
    throw new Error(payload?.message || "MERCHANT_INVOICE_FAILED");
  }
  return { id: payload.id, url: payload.url };
}

export type MerchantInvoiceStatus = { id: string; status: string; amountHalalas: number; orderId: string };

export async function fetchMerchantInvoice(secretKey: string, invoiceId: string): Promise<MerchantInvoiceStatus | null> {
  if (!secretKey || !invoiceId) return null;
  const response = await fetch(`https://api.moyasar.com/v1/invoices/${encodeURIComponent(invoiceId)}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: authorization(secretKey) }
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as {
    id?: string; status?: string; amount?: number; metadata?: Record<string, unknown> | null;
  } | null;
  if (!payload?.id || !payload.status) return null;
  return {
    id: payload.id,
    status: payload.status,
    amountHalalas: Number(payload.amount) || 0,
    orderId: String(payload.metadata?.order_id ?? "")
  };
}

function mapInvoiceStatus(status: string): OrderStatus | null {
  if (status === "paid") return "paid";
  if (status === "canceled" || status === "expired" || status === "voided" || status === "failed") return "cancelled";
  return null;
}

/**
 * Handles a payment callback for one order. The webhook body is never
 * trusted - only the order id from the URL is used to find OUR row, then the
 * invoice is re-fetched from Moyasar with the merchant's own key and the
 * paid amount is compared against the order total. An invoice created with
 * some other account's key simply fails to fetch, so a forged callback can't
 * mark anything paid.
 */
export async function processOrderPaymentCallback(orderId: string): Promise<{ httpStatus: number; body: { ok: boolean; status?: string } }> {
  await ensureSchema();
  const order = orderId ? await prisma.catalogOrder.findUnique({ where: { id: orderId } }) : null;
  if (!order || !order.paymentId) return { httpStatus: 200, body: { ok: true } };
  if (order.status === "paid") return { httpStatus: 200, body: { ok: true, status: "paid" } };

  const secretKey = await getMerchantGatewayKeyForVerification(order.tenantId);
  const invoice = await fetchMerchantInvoice(secretKey, order.paymentId);
  if (!invoice || invoice.orderId !== order.id) return { httpStatus: 200, body: { ok: true } };

  const next = mapInvoiceStatus(invoice.status);
  if (!next) return { httpStatus: 200, body: { ok: true, status: order.status } };

  if (next === "paid" && invoice.amountHalalas !== Math.round(order.total * 100)) {
    console.error("Catalog order paid amount mismatch", { orderId: order.id });
    return { httpStatus: 200, body: { ok: true, status: order.status } };
  }

  // Claim the transition atomically so a callback delivered twice sends
  // the confirmation message once.
  const claimed = await prisma.catalogOrder.updateMany({
    where: { id: order.id, status: { not: next } },
    data: { status: next, updatedAt: new Date().toISOString() }
  });
  if (claimed.count === 0) return { httpStatus: 200, body: { ok: true, status: next } };

  if (next === "cancelled") await restockOrderUnits(order.tenantId, order.productId, order.quantity);

  if (next === "paid" && order.conversationId) {
    // The bot keeps a conversation "closed" while it handles it - a paid
    // order needs a human to fulfil it, so put it in the agents' queue.
    await prisma.conversation.updateMany({ where: { id: order.conversationId, status: "closed" }, data: { status: "unassigned", assignee: "بدون موظف" } });
    const conversation = await prisma.conversation.findUnique({ where: { id: order.conversationId }, include: { customer: true } });
    if (conversation) {
      await sendWhatsAppTextMessage({
        tenantId: order.tenantId,
        conversationId: order.conversationId,
        to: conversation.customer.phone,
        text: `تم استلام الدفع لطلبك (${order.productName}) بمبلغ ${order.total} ر.س. شكرًا لك! سنتواصل معك قريبًا لإتمام الطلب.`,
        author: "الرد الآلي"
      }).catch((error) => console.error("Order paid confirmation failed", error));
    }
  }

  return { httpStatus: 200, body: { ok: true, status: next } };
}
