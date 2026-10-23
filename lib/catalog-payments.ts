import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { getMerchantGatewayKeyForVerification, getOrderItems, restockOrder, type OrderStatus } from "./catalog";
import { getOrderDiscounts } from "./catalog-discounts";
import { getOrderShipping, type OrderShipping } from "./catalog-shipping";
import { getOrderBranches } from "./catalog-branches";
import { getOrderPickup, pickupText, type OrderPickup } from "./catalog-pickup";
import { getPrepSettings, prepSentence, setOrderPrep } from "./catalog-prep";
import { optionLines } from "./catalog-options";
import { sendWhatsAppTextMessage } from "./whatsapp-send";
import { shortOrderNumber } from "./order-number";
import { loyaltyMessageFor, recordPaidOrderForLoyalty } from "./loyalty";

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
}, paidAtIso: string, fallbackName = "", items?: Array<{ productName: string; quantity: number; unitPrice: number; options?: import("./catalog-options").OptionDetail[] }>, discount?: { code: string; amount: number }, shipping?: OrderShipping, pickup?: OrderPickup, prepMinutes?: number, branchName?: string): string {
  const name = usableCustomerName(order.customerName, order.customerPhone) || usableCustomerName(fallbackName, order.customerPhone);
  const amount = Number.isInteger(order.total) ? String(order.total) : order.total.toFixed(2);
  const currency = order.currency === "SAR" ? "ر.س" : order.currency;
  const lines = [
    name ? `شكرًا لك ${name}، تم استلام دفعك ✅` : "تم استلام دفعك ✅",
    "",
    `رقم الطلب: ${shortOrderNumber(order.id)}`,
    ...(items && items.length > 0
      ? ["المنتجات:", ...items.map((item) => [`\u200f• ${item.productName}`, ...optionLines(item.options ?? []).map((text) => `\u200f   ${text}`), `\u200f   الكمية: ${item.quantity}`].join("\n"))]
      : [`المنتج: ${order.productName}`, ...(order.quantity > 1 ? [`الكمية: ${order.quantity}`] : [])]),
    ...(discount ? [`الخصم (${discount.code}): -${Number.isInteger(discount.amount) ? discount.amount : discount.amount.toFixed(2)} ${currency}`] : []),
    ...(shipping ? [`التوصيل: ${shipping.methodName} إلى ${shipping.city}`, `رسوم التوصيل: ${shipping.fee > 0 ? `${Number.isInteger(shipping.fee) ? shipping.fee : shipping.fee.toFixed(2)} ${currency}` : "مجاني"}`] : []),
    ...(pickup ? [pickupText(pickup)] : []),
    ...(branchName ? [`الفرع: ${branchName}`] : []),
    `المبلغ المدفوع: ${amount} ${currency}`,
    ...(arabicDate(paidAtIso) ? [`التاريخ: ${arabicDate(paidAtIso)}`] : []),
    ...(prepMinutes ? ["", `⏱ ${prepSentence(prepMinutes)}`] : []),
    "",
    "سنتواصل معك إن احتجنا لشيء آخر."
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

  // An order created in the merchant's Zid store: Zid holds the payment, so ask Zid (never the delivery body).
  if (order.paymentId.startsWith("zid-")) {
    const { isZidOrderPaid } = await import("./zid-checkout");
    if (!(await isZidOrderPaid(order.tenantId, order.paymentId.slice(4)))) return { httpStatus: 200, body: { ok: true, status: order.status } };
    return applyOrderTransition(order, "paid");
  }

  // Tabby / Tamara: ask the provider (never the delivery body) and move the payment forward (capture / authorise).
  if (order.paymentId.startsWith("tabby-") || order.paymentId.startsWith("tamara-")) {
    const { verifyExternalPayment } = await import("./payments/registry");
    const verdict = await verifyExternalPayment(order);
    if (verdict.state === "paid") return applyOrderTransition(order, "paid");
    if (verdict.state === "failed") return applyOrderTransition(order, "cancelled");
    return { httpStatus: 200, body: { ok: true, status: order.status } };
  }

  const secretKey = await getMerchantGatewayKeyForVerification(order.tenantId);
  const invoice = await fetchMerchantInvoice(secretKey, order.paymentId);
  if (!invoice || invoice.orderId !== order.id) return { httpStatus: 200, body: { ok: true } };

  const next = mapInvoiceStatus(invoice.status);
  if (!next) return { httpStatus: 200, body: { ok: true, status: order.status } };

  if (next === "paid" && invoice.amountHalalas !== Math.round(order.total * 100)) {
    console.error("Catalog order paid amount mismatch", { orderId: order.id });
    return { httpStatus: 200, body: { ok: true, status: order.status } };
  }

  return applyOrderTransition(order, next);
}

/**
 * Moves a verified order to its new status, once: the transition is claimed atomically so a callback
 * delivered twice sends the confirmation (and the receipt) a single time. The caller has already verified
 * the payment with the provider.
 */
/** The name on the receipt: the company's name, else the workspace's brand name - never the internal workspace id. */
async function receiptMerchantName(tenantId: string): Promise<string> {
  const { getTenantCompanyName } = await import("./subscriptions");
  const company = await getTenantCompanyName(tenantId);
  if (company && company !== tenantId && !/^tenant-/i.test(company)) return company;
  const { getTenantBranding } = await import("./tenant-branding");
  return (await getTenantBranding(tenantId)).name || "Linkly";
}

async function applyOrderTransition(order: Awaited<ReturnType<typeof prisma.catalogOrder.findUniqueOrThrow>>, next: OrderStatus): Promise<{ httpStatus: number; body: { ok: boolean; status?: string } }> {
  const claimed = await prisma.catalogOrder.updateMany({
    where: { id: order.id, status: { not: next } },
    data: { status: next, updatedAt: new Date().toISOString() }
  });
  if (claimed.count === 0) return { httpStatus: 200, body: { ok: true, status: next } };

  if (next === "cancelled") await restockOrder(order);

  if (next === "paid" && order.conversationId) {
    const orderItems = (await getOrderItems([order.id])).get(order.id);
    const orderDiscount = (await getOrderDiscounts([order.id])).get(order.id);
    const orderShipping = (await getOrderShipping([order.id])).get(order.id);
    const orderPickup = (await getOrderPickup([order.id])).get(order.id);
    const orderBranch = (await getOrderBranches([order.id])).get(order.id)?.name;
    // The merchant's usual preparation time, told to the customer now and kept with the order.
    const prepSettings = await getPrepSettings(order.tenantId);
    const prepMinutes = prepSettings.enabled ? prepSettings.defaultMinutes : undefined;
    if (prepMinutes) await setOrderPrep(order.id, prepMinutes).catch((error) => console.error("Order prep time failed", error));
    // The bot keeps a conversation "closed" while it handles it - a paid
    // order needs a human to fulfil it, so put it in the agents' queue.
    await prisma.conversation.updateMany({ where: { id: order.conversationId, status: "closed" }, data: { status: "unassigned", assignee: "بدون موظف" } });
    const conversation = await prisma.conversation.findUnique({ where: { id: order.conversationId }, include: { customer: true } });
    if (conversation) {
      await sendWhatsAppTextMessage({
        tenantId: order.tenantId,
        conversationId: order.conversationId,
        to: conversation.customer.phone,
        text: buildPaidOrderMessage(order, new Date().toISOString(), conversation.customer.name, orderItems, orderDiscount, orderShipping, orderPickup, prepMinutes, orderBranch),
        author: "الرد الآلي"
      }).catch((error) => console.error("Order paid confirmation failed", error));

      // The payment receipt as a PDF, right after the text confirmation. Best-effort:
      // a failure here must never undo or repeat the confirmation above.
      try {
        const [{ renderReceiptPdf }, { sendWhatsAppUploadedMedia }] = await Promise.all([
          import("./order-receipt"),
          import("./whatsapp-send")
        ]);
        const pdf = await renderReceiptPdf({
          merchantName: await receiptMerchantName(order.tenantId),
          orderId: order.id,
          customerName: order.customerName || conversation.customer.name,
          productName: order.productName,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          total: order.total,
          currency: order.currency,
          paidAtIso: new Date().toISOString(),
          items: orderItems?.map((item) => ({ name: item.options?.length ? `${item.productName} (${item.options.map((option) => option.name).join("، ")})` : item.productName, quantity: item.quantity, unitPrice: item.unitPrice })),
          discount: orderDiscount ? { code: orderDiscount.code, amount: orderDiscount.amount } : undefined,
          shipping: orderShipping ? { name: orderShipping.methodName, city: orderShipping.city, fee: orderShipping.fee } : undefined,
          pickup: orderPickup ? pickupText(orderPickup) : undefined,
          branch: orderBranch
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

  // Loyalty: this paid WhatsApp order counts toward the customer's reward. Best-effort, after everything above.
  if (next === "paid") {
    try {
      const loyaltyOrder = { id: order.id, tenantId: order.tenantId, customerName: order.customerName, customerPhone: order.customerPhone, paymentId: order.paymentId, conversationId: order.conversationId };
      const outcome = await recordPaidOrderForLoyalty(loyaltyOrder);
      const text = await loyaltyMessageFor(loyaltyOrder, outcome);
      if (text && order.conversationId) {
        const conversation = await prisma.conversation.findUnique({ where: { id: order.conversationId }, include: { customer: true } });
        if (conversation) await sendWhatsAppTextMessage({ tenantId: order.tenantId, conversationId: order.conversationId, to: conversation.customer.phone, text, author: "الرد الآلي" });
      }
    } catch (error) {
      console.error("Loyalty notification failed", error);
    }
  }

  return { httpStatus: 200, body: { ok: true, status: next } };
}

