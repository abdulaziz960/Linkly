// Tamara (buy now, pay later) for the chat checkout. Documented at https://docs.tamara.co: a checkout session returns a
// `checkout_url`; once Tamara approves the customer the order must be authorised by the merchant (the approved
// notification), after which it is the merchant's to capture (Tamara captures an uncaptured order by itself after 21
// days). Notifications are never trusted on their own: the order is always read back from Tamara.

import { PaymentProviderError, type CreatedPayment, type PaymentRequest, type PaymentVerdict } from "./types";
import type { TamaraConfig } from "./config";

const TIMEOUT_MS = 20_000;

export function tamaraBase(config: Pick<TamaraConfig, "sandbox">): string {
  return config.sandbox ? "https://api-sandbox.tamara.co" : "https://api.tamara.co";
}

async function call(config: TamaraConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${tamaraBase(config)}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, payload };
}

function sar(amount: number, currency: string) {
  return { amount: Math.round(amount * 100) / 100, currency };
}

/** "dd-mm-yyyy" in Riyadh time, the date format Tamara asks for. */
export function tamaraDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Riyadh" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/** The customer's name as Tamara wants it: a first and a last name. */
export function splitName(name: string): { first: string; last: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { first: "عميل", last: "-" };
  if (words.length === 1) return { first: words[0], last: "-" };
  return { first: words[0], last: words.slice(1).join(" ") };
}

export type TamaraFailure = "declined" | "not-available";

/** Starts a Tamara checkout session; returns Tamara's order id and the page the customer pays on. */
export async function createTamaraPayment(config: TamaraConfig, request: PaymentRequest & { notificationUrl: string }): Promise<CreatedPayment> {
  const { first, last } = splitName(request.customer.name);
  const phone = request.customer.phone.replace(/\D/g, "");
  const address = {
    first_name: first,
    last_name: last,
    line1: (request.shipping?.address || "—").slice(0, 200),
    city: request.shipping?.city || "الرياض",
    country_code: "SA",
    phone_number: phone
  };
  const body = {
    order_reference_id: request.orderId,
    order_number: request.orderId.slice(-8).toUpperCase(),
    total_amount: sar(request.amount, request.currency),
    description: request.description.slice(0, 250),
    country_code: "SA",
    payment_type: "PAY_BY_INSTALMENTS",
    instalments: 3,
    locale: "ar_SA",
    platform: "Linkly",
    items: request.items.map((item) => ({
      reference_id: item.sku || item.name.slice(0, 40),
      type: "Physical",
      name: item.name.slice(0, 120),
      sku: item.sku || item.name.slice(0, 40),
      quantity: Math.max(1, Math.floor(item.quantity)),
      unit_price: sar(item.unitPrice, request.currency),
      total_amount: sar(item.unitPrice * item.quantity, request.currency)
    })),
    consumer: { first_name: first, last_name: last, phone_number: phone, ...(request.customer.email ? { email: request.customer.email } : {}) },
    shipping_address: address,
    billing_address: address,
    shipping_amount: sar(request.shippingFee, request.currency),
    tax_amount: sar(0, request.currency),
    ...(request.discountAmount > 0 ? { discount: { name: request.discountName || "خصم", amount: sar(request.discountAmount, request.currency) } } : {}),
    merchant_url: { success: request.urls.success, failure: request.urls.failure, cancel: request.urls.cancel, notification: request.notificationUrl },
    risk_assessment: {
      is_premium_customer: false,
      account_creation_date: tamaraDate(request.customer.registeredSince) ?? tamaraDate(new Date().toISOString()),
      total_order_count: request.customer.history.count,
      date_first_paid: request.customer.history.count > 0 ? tamaraDate(request.customer.history.firstPaidAt) : null,
      date_last_paid: request.customer.history.count > 0 ? tamaraDate(request.customer.history.lastPaidAt) : null
    },
    expires_in_minutes: 60
  };

  const result = await call(config, "/checkout", { method: "POST", body: JSON.stringify(body) });
  if (!result.ok || !result.payload) {
    const message = typeof result.payload?.message === "string" ? result.payload.message : "";
    console.error("Tamara checkout creation failed", { status: result.status, message });
    // 4xx for this customer / amount (not eligible, outside the limits): offer another method; anything else is a fault.
    throw new PaymentProviderError(message || `تعذّر إنشاء جلسة الدفع لدى تمارا (${result.status})`, result.status >= 400 && result.status < 500 && result.status !== 401 && result.status !== 403 ? "rejected" : "failed");
  }
  const payload = result.payload as { order_id?: string; checkout_url?: string };
  if (!payload.order_id || !payload.checkout_url) throw new PaymentProviderError("لم ترجع تمارا رابط الدفع", "failed");
  return { externalId: payload.order_id, url: payload.checkout_url };
}

type OrderPayload = { status?: string; total_amount?: { amount?: number } };

/**
 * Reads the order from Tamara and moves it forward: approved -> authorised (once) -> paid. An authorised (or captured)
 * order counts as paid; capturing is the merchant's, when the goods ship (Tamara auto-captures after 21 days).
 */
export async function verifyTamaraOrder(config: TamaraConfig, orderId: string, expectedAmount: number): Promise<PaymentVerdict> {
  const read = await call(config, `/orders/${encodeURIComponent(orderId)}`);
  if (!read.ok || !read.payload) return { state: "pending", reason: `تعذّر قراءة الطلب من تمارا (${read.status})` };
  const order = read.payload as OrderPayload;
  const status = String(order.status || "").toLowerCase();

  if (status === "declined" || status === "expired" || status === "canceled") return { state: "failed", reason: status };
  if (status === "new") return { state: "pending" };

  const total = Number(order.total_amount?.amount);
  if (Number.isFinite(total) && Math.round(total * 100) !== Math.round(expectedAmount * 100)) {
    console.error("Tamara order amount mismatch", { orderId });
    return { state: "pending", reason: "amount-mismatch" };
  }

  if (status === "authorised" || status === "fully_captured" || status === "partially_captured") return { state: "paid" };

  if (status === "approved") {
    const authorised = await call(config, `/orders/${encodeURIComponent(orderId)}/authorise`, { method: "POST" });
    if (authorised.ok) return { state: "paid" };
    console.error("Tamara authorise failed", { status: authorised.status });
    return { state: "pending", reason: "authorise-failed" };
  }
  return { state: "pending" };
}

/** Registers our notification URL at Tamara (the `authorization` header carries a secret only we know). Registration also checks the token. */
export async function registerTamaraWebhook(config: TamaraConfig, url: string, secret: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await call(config, "/webhooks", {
    method: "POST",
    body: JSON.stringify({ type: "order", url, events: ["order_approved", "order_authorised", "order_canceled", "order_captured", "order_refunded"], headers: { authorization: secret } })
  });
  if (result.ok) return { ok: true };
  if (result.status === 401 || result.status === 403) return { ok: false, error: "رمز واجهة تمارا غير صحيح" };
  return { ok: false, error: `تعذّر تسجيل إشعارات تمارا (${result.status})` };
}
