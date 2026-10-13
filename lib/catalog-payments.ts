import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { getMerchantGatewayKeyForVerification, restockOrderUnits, type OrderStatus } from "./catalog";
import { sendWhatsAppTextMessage } from "./whatsapp-send";
import { shortOrderNumber } from "./order-number";

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

export { shortOrderNumber };

export type MerchantInvoice = { id: string; url: string };

function usableCustomerName(name: string, phone = ""): string {
  const value = (name || "").trim();
  if (!value || value === phone || /^عميل\s+\S+$/i.test(value)) return "";
  return value;
}

function arabicDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(date);
}

/** The payment-received message: who, which order, what, how much and when - a plain-text receipt. */
export function buildPaidOrderMessage(order: {
  id: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  quantity: number;
  total: number;
  currency: string;
}, paidAtIso: string, fallbackName = ""): string {
  const name = usableCustomerName(order.customerName, order.customerPhone) || usableCustomerName(fallbackName, order.customerPhone);
  const amount = Number.isInteger(order.total) ? String(order.total) : order.total.toFixed(2);
  const currency = order.currency === "SAR" ? "ر.س" : order.currency;
  const lines = [
    name ? `شكرًا لك ${name}، تم استلام دفعك ✅` : "تم استلام دفعك ✅",
    "",
    `رقم الطلب: ${shortOrderNumber(order.id)}`,
    `المنتج: ${order.productName}`,
    ...(order.quantity > 1 ? [`الكمية: ${order.quantity}`] : []),
    `المبلغ المدفوع: ${amount} ${currency}`,
    ...(arabicDate(paidAtIso) ? [`التاريخ: ${arabicDate(paidAtIso)}`] : []),
    "",
    "سنتواصل معك قريبًا لإتمام الطلب."
  ];
  return lines.join("\n");
}

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
/**
 * Safety net for a payment callback that never arrives (or arrives while the
 * server is down): re-checks every recent order still awaiting payment against
 * Moyasar. processOrderPaymentCallback is idempotent, so an order the callback
 * already handled is simply skipped.
 */
export async function reconcileAwaitingOrders(limit = 25): Promise<{ checked: number }> {
  await ensureSchema();
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const orders = await prisma.catalogOrder.findMany({
    where: { status: "awaiting_payment", paymentId: { not: "" }, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true }
  });
  for (const order of orders) {
    await processOrderPaymentCallback(order.id).catch((error) => console.error("Order payment reconcile failed", error));
  }
  return { checked: orders.length };
}

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
        text: buildPaidOrderMessage(order, new Date().toISOString(), conversation.customer.name),
        author: "الرد الآلي"
      }).catch((error) => console.error("Order paid confirmation failed", error));

      // The payment receipt as a PDF, right after the text confirmation. Best-effort:
      // a failure here must never undo or repeat the confirmation above.
      try {
        const [{ renderReceiptPdf }, { sendWhatsAppUploadedMedia }, { getTenantCompanyName }] = await Promise.all([
          import("./order-receipt"),
          import("./whatsapp-send"),
          import("./subscriptions")
        ]);
        const pdf = await renderReceiptPdf({
          merchantName: await getTenantCompanyName(order.tenantId),
          orderId: order.id,
          customerName: order.customerName || conversation.customer.name,
          productName: order.productName,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          total: order.total,
          currency: order.currency,
          paidAtIso: new Date().toISOString()
        });
        await sendWhatsAppUploadedMedia({
          tenantId: order.tenantId,
          conversationId: order.conversationId,
          to: conversation.customer.phone,
          kind: "document",
          dataUrl: `data:application/pdf;base64,${pdf.toString("base64")}`,
          mimeType: "application/pdf",
          fileName: `receipt-${shortOrderNumber(order.id)}.pdf`,
          caption: `إيصال الدفع - ${shortOrderNumber(order.id)}`,
          author: "الرد الآلي"
        });
      } catch (error) {
        console.error("Order receipt PDF failed", error);
      }
    }
  }

  return { httpStatus: 200, body: { ok: true, status: next } };
}
