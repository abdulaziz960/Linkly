// Tabby (buy now, pay later) for the chat checkout. Documented at https://docs.tabby.ai: a checkout session returns a
// hosted payment page link; after the customer pays the payment is AUTHORIZED and must be captured by the merchant
// (only captured payments are settled); webhooks announce the status changes but are never trusted on their own -
// the payment is always re-read from Tabby before an order is marked paid.

import { PaymentProviderError, type CreatedPayment, type PaymentRequest, type PaymentVerdict } from "./types";
import type { TabbyConfig } from "./config";

/** Saudi merchants: the KSA host (Tabby asks every call to use the region's own host). */
export const TABBY_BASE = "https://api.tabby.sa";
const TIMEOUT_MS = 20_000;

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

async function call(config: TabbyConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${TABBY_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
      ...(config.merchantCode ? { "X-Merchant-Code": config.merchantCode } : {}),
      ...(init.headers || {})
    }
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, payload };
}

/** What to tell the customer when Tabby does not approve the purchase (its documented reasons). */
export function tabbyRejectionMessage(reason: unknown): string {
  if (reason === "order_amount_too_high") return "قيمة الطلب تفوق الحد المسموح به حاليًا مع تابي. خفّض قيمة السلة أو اختر وسيلة دفع أخرى.";
  if (reason === "order_amount_too_low") return "قيمة الطلب أقل من الحد الأدنى لاستخدام تابي. زد قيمة الطلب أو اختر وسيلة دفع أخرى.";
  return "تعذّرت الموافقة على الشراء عبر تابي. اختر وسيلة دفع أخرى.";
}

/** Starts a Tabby checkout session for an order; returns the payment id and the page the customer pays on. */
export async function createTabbyPayment(config: TabbyConfig, request: PaymentRequest): Promise<CreatedPayment> {
  const body = {
    payment: {
      amount: money(request.amount),
      currency: request.currency,
      description: request.description.slice(0, 250),
      buyer: {
        name: request.customer.name || "عميل",
        email: request.customer.email || "",
        phone: `+${request.customer.phone.replace(/\D/g, "")}`
      },
      shipping_address: {
        city: request.shipping?.city || "الرياض",
        address: request.shipping?.address || "—",
        zip: "00000"
      },
      order: {
        reference_id: request.orderId,
        tax_amount: "0.00",
        shipping_amount: money(request.shippingFee),
        discount_amount: money(request.discountAmount),
        items: request.items.map((item) => ({
          reference_id: item.sku || item.name.slice(0, 40),
          title: item.name.slice(0, 120),
          quantity: Math.max(1, Math.floor(item.quantity)),
          unit_price: money(item.unitPrice),
          category: "General"
        }))
      },
      buyer_history: {
        registered_since: request.customer.registeredSince,
        is_phone_number_verified: true,
        is_email_verified: false
      },
      meta: { order_id: request.orderId }
    },
    lang: "ar",
    merchant_code: config.merchantCode,
    merchant_urls: request.urls
  };

  const result = await call(config, "/api/v2/checkout", { method: "POST", body: JSON.stringify(body) });
  if (!result.ok || !result.payload) {
    const message = typeof result.payload?.error === "string" ? result.payload.error : `تعذّر إنشاء جلسة الدفع لدى تابي (${result.status})`;
    console.error("Tabby session creation failed", { status: result.status });
    throw new PaymentProviderError(message, "failed");
  }
  const payload = result.payload as {
    status?: string;
    payment?: { id?: string };
    configuration?: { available_products?: { installments?: Array<{ web_url?: string }> }; products?: { installments?: { rejection_reason?: string | null } } };
  };
  if (payload.status === "rejected") throw new PaymentProviderError(tabbyRejectionMessage(payload.configuration?.products?.installments?.rejection_reason), "rejected");
  const url = payload.configuration?.available_products?.installments?.[0]?.web_url;
  const id = payload.payment?.id;
  if (!url || !id) throw new PaymentProviderError("لم يرجع تابي رابط الدفع", "failed");
  return { externalId: id, url };
}

type PaymentPayload = { id?: string; status?: string; amount?: string; captures?: unknown[] };

/**
 * Reads the payment from Tabby and moves it forward: AUTHORIZED -> captured in full (once, idempotent) -> paid.
 * Never trusts a redirect or a webhook body: only this answer.
 */
export async function verifyTabbyPayment(config: TabbyConfig, paymentId: string, expectedAmount: number, orderId: string): Promise<PaymentVerdict> {
  const read = await call(config, `/api/v2/payments/${encodeURIComponent(paymentId)}`);
  if (!read.ok || !read.payload) return { state: "pending", reason: `تعذّر قراءة الدفعة من تابي (${read.status})` };
  const payment = read.payload as PaymentPayload;
  const status = String(payment.status || "").toUpperCase();

  if (status === "REJECTED" || status === "EXPIRED") return { state: "failed", reason: status.toLowerCase() };
  if (status === "CREATED") return { state: "pending" };

  // The amount must be the order's: a payment for a different amount is never accepted.
  if (payment.amount !== undefined && Math.round(Number(payment.amount) * 100) !== Math.round(expectedAmount * 100)) {
    console.error("Tabby payment amount mismatch", { orderId });
    return { state: "pending", reason: "amount-mismatch" };
  }

  if (status === "CLOSED") return { state: Array.isArray(payment.captures) && payment.captures.length > 0 ? "paid" : "failed", reason: "closed" };

  if (status === "AUTHORIZED") {
    const capture = await call(config, `/api/v2/payments/${encodeURIComponent(paymentId)}/captures`, {
      method: "POST",
      body: JSON.stringify({ amount: money(expectedAmount), reference_id: `capture-${orderId}` })
    });
    if (capture.ok) return { state: "paid" };
    // The webhook and the redirect can both try to capture: if it is closed by now, it is paid.
    const again = await call(config, `/api/v2/payments/${encodeURIComponent(paymentId)}`);
    const latest = again.payload as PaymentPayload | null;
    if (String(latest?.status || "").toUpperCase() === "CLOSED" && Array.isArray(latest?.captures) && latest.captures.length > 0) return { state: "paid" };
    console.error("Tabby capture failed", { status: capture.status, orderId });
    return { state: "pending", reason: "capture-failed" };
  }
  return { state: "pending" };
}

/**
 * Registers our webhook at Tabby (a secret the merchant never sees signs each call in `X-Auth-Key`). Registration is the
 * check that the key and merchant code are valid, too.
 */
export async function registerTabbyWebhook(config: TabbyConfig, url: string, secret: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await call(config, "/api/v1/webhooks", { method: "POST", body: JSON.stringify({ url, header: { title: "X-Auth-Key", value: secret } }) });
  if (result.ok) return { ok: true };
  if (result.status === 401 || result.status === 403) return { ok: false, error: "مفتاح تابي أو رمز التاجر غير صحيح" };
  return { ok: false, error: `تعذّر تسجيل إشعارات تابي (${result.status})` };
}
