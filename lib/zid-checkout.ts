import { fetchZidOrderRaw, zidApiGet, zidApiPost } from "./zid";

/**
 * Buying from the WhatsApp catalog in a Zid store: the order is created in the store itself (so stock,
 * shipping and the invoice live in Zid) and the customer pays through Zid's payment link.
 *
 * Written from Zid's "Create Order" page (POST /v1/managers/store/drafts, scope third_create_order) and not
 * yet exercised against a live store. The payment-method list endpoint is not documented in what was
 * available, so the id can also be entered by hand in the settings.
 */

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}
function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export type DeliveryOption = { id: number; name: string };

export async function listZidDeliveryOptions(tenantId: string): Promise<{ ok: boolean; options: DeliveryOption[]; message: string }> {
  const result = await zidApiGet(tenantId, "/managers/store/delivery-options?payload_type=simple");
  if (!result.ok) return { ok: false, options: [], message: result.status === 401 || result.status === 403 ? "زد رفضت الطلب: تحقق من صلاحية الشحن (Shipping: Read) في التطبيق." : `تعذر جلب خيارات الشحن (${result.status})` };
  const rows = Array.isArray(result.payload.delivery_options) ? result.payload.delivery_options : Array.isArray(result.payload.store_shipping_methods) ? result.payload.store_shipping_methods : [];
  const options = rows
    .map((row) => {
      const item = obj(row);
      const id = Number(str(item.id));
      const name = str(item.name) || str(obj(item.name).ar) || str(obj(item.name).en);
      return Number.isInteger(id) && id > 0 ? { id, name: name || `#${id}` } : null;
    })
    .filter((option): option is DeliveryOption => option !== null);
  return { ok: true, options, message: "" };
}

/** The store's "payment link" method id, looked up through the Merchant API when the endpoint answers. 0 = not found. */
export async function findZidPaymentLinkMethodId(tenantId: string): Promise<number> {
  for (const path of ["/managers/store/payment-methods", "/managers/store/payment-methods/"]) {
    const result = await zidApiGet(tenantId, path);
    if (!result.ok) continue;
    const rows = Array.isArray(result.payload.payment_methods) ? result.payload.payment_methods : Array.isArray(result.payload.data) ? result.payload.data : Array.isArray(result.payload.results) ? result.payload.results : [];
    for (const row of rows) {
      const item = obj(row);
      const code = str(item.code).toLowerCase();
      const id = Number(str(item.id));
      if (code.includes("payment_link") && Number.isInteger(id) && id > 0) return id;
    }
  }
  return 0;
}

/** "0500000111" / "966500000111" / "+966 50 000 0111" -> { code: "966", number: "500000111" }. */
export function splitPhone(phone: string): { code: string; number: string } {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  if (digits.startsWith("966")) return { code: "966", number: digits.slice(3).replace(/^0+/, "") };
  if (/^05\d{8}$/.test(digits)) return { code: "966", number: digits.slice(1) };
  if (/^5\d{8}$/.test(digits)) return { code: "966", number: digits };
  return { code: digits.slice(0, 3) || "966", number: digits.slice(3) || digits };
}

export type ZidOrderInput = {
  customerName: string;
  phone: string;
  city: string;
  addressLine: string;
  sku?: string;
  quantity?: number;
  /** Several products at once (a cart); when present they replace sku/quantity. */
  lines?: Array<{ sku: string; quantity: number }>;
  shippingMethodId: number;
  paymentMethodId: number;
  linkValidHours: number;
  currency?: string;
};

export type ZidOrderResult =
  | { ok: true; orderId: string; code: string; paymentLink: string }
  | { ok: false; message: string };

/** The request body exactly as Zid documents it (kept pure so it can be tested). */
export function buildZidOrderBody(input: ZidOrderInput, now = new Date()): Record<string, unknown> {
  const { code, number } = splitPhone(input.phone);
  const name = input.customerName.trim() || "عميل واتساب";
  const contact = { full_name: name, mobile_country_code: code, mobile_number: number, email: `wa-${code}${number}@linklysa.io` };
  const expires = new Date(now.getTime() + Math.max(1, input.linkValidHours) * 3600_000).toISOString();
  return {
    currency_code: input.currency || "SAR",
    coupon_code: null,
    customer: contact,
    consignee: {
      contact,
      address: {
        line_1: input.addressLine.trim().slice(0, 200),
        line_2: "",
        city_name: input.city.trim().slice(0, 80),
        country_code: "SA",
        lat: null,
        lng: null,
        short_address: null,
        meta: { postcode: "", building_number: "", additional_number: "", city_name: input.city.trim().slice(0, 80) }
      }
    },
    is_gift: false,
    is_gifted_consignee_notifiable: false,
    products: (input.lines?.length ? input.lines : [{ sku: input.sku ?? "", quantity: input.quantity ?? 1 }]).map((line) => ({ sku: line.sku, quantity: Math.max(1, Math.floor(line.quantity)) })),
    shipping_method: { type: "delivery", id: input.shippingMethodId },
    payment_method: { id: input.paymentMethodId, payment_link_configs: { expiryDateTime: expires } },
    customer_comment: null,
    created_by: "api"
  };
}

function validationMessage(payload: Json): string {
  const message = obj(payload.message);
  const validations = Array.isArray(message.validations) ? message.validations : [];
  const first = obj(validations[0]);
  const errors = Array.isArray(first.errors) ? first.errors.map(str).filter(Boolean) : [];
  return errors.length ? `${str(first.field)}: ${errors[0]}` : str(message.description) || str(message.name);
}

export async function createZidOrder(tenantId: string, input: ZidOrderInput): Promise<ZidOrderResult> {
  const result = await zidApiPost(tenantId, "/managers/store/drafts", buildZidOrderBody(input));
  if (!result.ok) return { ok: false, message: validationMessage(result.payload) || `رفضت زد الطلب (${result.status})` };
  const order = obj(result.payload.order);
  const orderId = str(order.id);
  const paymentLink = str(order.payment_link);
  if (!orderId) return { ok: false, message: "لم ترجع زد رقم الطلب" };
  return { ok: true, orderId, code: str(order.code) || orderId, paymentLink };
}

/** Whether Zid says this order is paid (the delivery body is never trusted: the order is re-read). */
export async function isZidOrderPaid(tenantId: string, orderId: string): Promise<boolean> {
  const order = await fetchZidOrderRaw(tenantId, orderId);
  if (!order) return false;
  const status = order.payment_status;
  const code = (typeof status === "string" ? status : str(obj(status).code) || str(obj(status).name)).toLowerCase();
  return code === "paid" || code === "مدفوع";
}
