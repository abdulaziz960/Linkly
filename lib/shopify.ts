import { createHmac, timingSafeEqual } from "crypto";
import { readStoreTokens, saveStoreTokens } from "./store-connections";
import { storePhone, type StoreCart, type StoreEvent, type StoreOrder } from "./salla";

/**
 * Shopify adapter: OAuth (per shop), the Admin REST API (orders, webhook registration) and webhooks,
 * normalised into the same StoreOrder / StoreCart / StoreEvent shapes the store engine uses for Salla
 * and Zid. Written from the public documentation and not yet exercised against a live store; every
 * field read is defensive and the pure parts are covered by tests.
 *
 * Needs SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET. The same secret signs the OAuth redirect and
 * every webhook, so there is no separate webhook secret.
 */

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION?.trim() || "2026-10";

/** Orders (and the checkouts that become abandoned carts) need read_orders; customers for names and phones. */
const DEFAULT_SCOPES = "read_orders,read_customers";

export const SHOPIFY_WEBHOOK_TOPICS = ["orders/create", "orders/updated", "checkouts/create", "checkouts/update", "app/uninstalled"] as const;

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}
function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
function num(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : 0;
}

// ---------- shop domain ----------

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function isShopifyShopDomain(value: string): boolean {
  return SHOP_DOMAIN.test(value);
}

/**
 * What a merchant types ("my-store", "my-store.myshopify.com", a store admin URL) into the canonical
 * "my-store.myshopify.com", or "" when it cannot be a shop. Nothing else is ever used to build a URL
 * that is called.
 */
export function normalizeShopDomain(input: string): string {
  let value = (input || "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^https?:\/\//, "");
  const adminStore = /^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/.exec(value);
  if (adminStore) return `${adminStore[1]}.myshopify.com`;
  value = value.split(/[/?#]/)[0];
  if (!value.includes(".")) value = `${value}.myshopify.com`;
  return isShopifyShopDomain(value) ? value : "";
}

// ---------- signatures ----------

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Webhooks: base64 HMAC-SHA256 of the raw body with the app client secret (X-Shopify-Hmac-Sha256). */
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null | undefined, secret = process.env.SHOPIFY_CLIENT_SECRET || ""): boolean {
  if (!secret || !hmacHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return safeEqual(hmacHeader.trim(), expected);
}

/** OAuth redirect / install request: hex HMAC-SHA256 over the other query parameters, sorted by name. */
export function verifyShopifyQuery(params: URLSearchParams, secret = process.env.SHOPIFY_CLIENT_SECRET || ""): boolean {
  const provided = (params.get("hmac") || "").trim().toLowerCase();
  if (!secret || !provided) return false;
  const entries = Array.from(params.entries()).filter(([key]) => key !== "hmac" && key !== "signature");
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const escape = (value: string) => value.replace(/%/g, "%25").replace(/&/g, "%26");
  const message = entries.map(([key, value]) => `${escape(key).replace(/=/g, "%3D")}=${escape(value)}`).join("&");
  const expected = createHmac("sha256", secret).update(message, "utf8").digest("hex");
  return safeEqual(provided, expected);
}

// ---------- normalisation ----------

function fullName(...candidates: Json[]): string {
  for (const candidate of candidates) {
    const name = [str(candidate.first_name), str(candidate.last_name)].filter(Boolean).join(" ") || str(candidate.name);
    if (name) return name;
  }
  return "";
}

function phoneOf(...sources: Json[]): string {
  for (const source of sources) {
    const phone = storePhone("", source.phone);
    if (phone) return phone;
  }
  return "";
}

const STATUS_LABELS: Record<string, string> = {
  cancelled: "ملغي",
  delivered: "تم التسليم",
  shipped: "تم الشحن",
  pending: "بانتظار الدفع",
  processing: "قيد التجهيز"
};

/**
 * Shopify has no "in progress / shipped / delivered" field: the state is derived from the order's
 * cancellation, its fulfillments and its payment. The slugs are words the engine's status grouping
 * already understands (see orderStatusGroup).
 */
export function shopifyStatusSlug(order: Json): string {
  if (str(order.cancelled_at)) return "cancelled";
  const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments.map(obj) : [];
  if (fulfillments.some((fulfillment) => str(fulfillment.shipment_status) === "delivered")) return "delivered";
  const fulfillmentStatus = str(order.fulfillment_status);
  if (fulfillmentStatus === "fulfilled" || fulfillmentStatus === "partial") return "shipped";
  const financial = str(order.financial_status);
  if (financial === "pending" || financial === "authorized") return "pending";
  return "processing";
}

export function normalizeShopifyOrder(raw: unknown): StoreOrder | null {
  const order = obj(raw);
  const id = str(order.id);
  if (!id) return null;
  const customer = obj(order.customer);
  const shipping = obj(order.shipping_address);
  const billing = obj(order.billing_address);
  const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments.map(obj) : [];
  const tracked = fulfillments.find((fulfillment) => str(fulfillment.tracking_number) || str(fulfillment.tracking_url)) ?? fulfillments[0] ?? {};
  const trackingUrls = Array.isArray(tracked.tracking_urls) ? tracked.tracking_urls : [];
  const slug = shopifyStatusSlug(order);
  const shopMoney = obj(obj(order.total_price_set).shop_money);
  return {
    id,
    // The number the customer sees ("#1001"): order_number, never the internal id.
    reference: str(order.order_number) || str(order.name).replace(/^#/, "") || id,
    statusSlug: slug,
    statusLabel: STATUS_LABELS[slug] ?? slug,
    customerName: fullName(customer, shipping, billing),
    customerPhone: phoneOf(order, customer, shipping, billing),
    total: num(order.total_price) || num(shopMoney.amount),
    currency: str(order.currency) || str(shopMoney.currency_code) || "SAR",
    trackingNumber: str(tracked.tracking_number),
    trackingUrl: str(tracked.tracking_url) || str(trackingUrls[0]) || str(order.order_status_url),
    shippingCompany: str(tracked.tracking_company)
  };
}

export function normalizeShopifyCheckout(raw: unknown): StoreCart | null {
  const checkout = obj(raw);
  const id = str(checkout.id) || str(checkout.token);
  if (!id) return null;
  // A completed checkout became an order: it is not an abandoned cart.
  if (str(checkout.completed_at)) return null;
  const customer = obj(checkout.customer);
  const shipping = obj(checkout.shipping_address);
  const billing = obj(checkout.billing_address);
  return {
    id,
    customerName: fullName(customer, shipping, billing),
    customerPhone: phoneOf(checkout, customer, shipping, billing),
    total: num(checkout.total_price) || num(checkout.subtotal_price),
    currency: str(checkout.currency) || str(checkout.presentment_currency) || "SAR",
    url: str(checkout.abandoned_checkout_url) || str(checkout.recovery_url)
  };
}

/** Pure: a webhook (topic + shop + body) into the engine's events. */
export function parseShopifyWebhook(topic: string, shop: string, body: unknown): StoreEvent {
  const merchantId = shop;
  if (topic === "orders/create" || topic === "orders/updated" || topic === "orders/paid" || topic === "orders/fulfilled" || topic === "orders/cancelled") {
    const order = normalizeShopifyOrder(body);
    if (!order) return { type: "ignored", merchantId, event: topic };
    if (topic === "orders/create") return { type: "order.created", merchantId, order };
    // orders/updated fires for every edit, including the one right after creation: an order that is
    // still unfulfilled and not cancelled has not changed in a way the customer needs to hear about.
    if (order.statusSlug === "processing" || order.statusSlug === "pending") return { type: "ignored", merchantId, event: topic };
    return { type: "order.status.updated", merchantId, order };
  }
  if (topic === "checkouts/create" || topic === "checkouts/update") {
    const cart = normalizeShopifyCheckout(body);
    if (cart && cart.customerPhone) return { type: "abandoned.cart", merchantId, cart };
    return { type: "ignored", merchantId, event: topic };
  }
  return { type: "ignored", merchantId, event: topic };
}

// ---------- OAuth ----------

export function shopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

export function shopifyRedirectUri(origin: string): string {
  return `${origin}/api/shopify/callback`;
}

export function shopifyAuthorizeUrl(shop: string, state: string, redirectUri: string): string {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", process.env.SHOPIFY_CLIENT_ID || "");
  url.searchParams.set("scope", process.env.SHOPIFY_SCOPES || DEFAULT_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeShopifyCode(shop: string, code: string): Promise<{ accessToken: string; scope: string } | { error: string }> {
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID || "", client_secret: process.env.SHOPIFY_CLIENT_SECRET || "", code }),
      signal: AbortSignal.timeout(10000)
    });
    const payload = (await response.json().catch(() => null)) as { access_token?: string; scope?: string; error_description?: string } | null;
    if (!response.ok || !payload?.access_token) return { error: payload?.error_description || "تعذر الحصول على رمز الوصول من شوبيفاي" };
    return { accessToken: payload.access_token, scope: payload.scope || "" };
  } catch {
    return { error: "تعذر الاتصال بشوبيفاي" };
  }
}

// ---------- Admin API ----------

async function shopifyRequest(shop: string, token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; payload: Json }> {
  try {
    const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
      method: init.method || "GET",
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    return { ok: response.ok, status: response.status, payload: obj(await response.json().catch(() => null)) };
  } catch {
    return { ok: false, status: 0, payload: {} };
  }
}

export async function fetchShopifyShop(shop: string, token: string): Promise<{ domain: string; name: string } | null> {
  const result = await shopifyRequest(shop, token, "/shop.json");
  const data = obj(result.payload.shop);
  const domain = str(data.myshopify_domain) || shop;
  if (!result.ok || !isShopifyShopDomain(domain)) return null;
  return { domain, name: str(data.name) || domain };
}

/** Subscribes the shop to the events the engine reads. Returns how many topics are now registered. */
export async function registerShopifyWebhooks(shop: string, token: string, address: string): Promise<{ registered: number; failed: string[] }> {
  let registered = 0;
  const failed: string[] = [];
  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const result = await shopifyRequest(shop, token, "/webhooks.json", { method: "POST", body: { webhook: { topic, address, format: "json" } } });
    // 422 "address for this topic has already been taken": registered by an earlier connect.
    if (result.ok || result.status === 422) registered += 1;
    else failed.push(topic);
  }
  return { registered, failed };
}

/** The shop's domain and token for a workspace (the connection stores the domain as the merchant id). */
async function connectionFor(tenantId: string): Promise<{ shop: string; token: string } | null> {
  const tokens = await readStoreTokens(tenantId, "shopify");
  if (!tokens || !tokens.merchantId || !isShopifyShopDomain(tokens.merchantId)) return null;
  return { shop: tokens.merchantId, token: tokens.accessToken };
}

/** The order the customer calls by this number, or null (not found, store not connected, API error). */
export async function findShopifyOrderByReference(tenantId: string, reference: string): Promise<StoreOrder | null> {
  const clean = reference.replace(/\D/g, "");
  if (!clean) return null;
  const connection = await connectionFor(tenantId);
  if (!connection) return null;
  const result = await shopifyRequest(connection.shop, connection.token, `/orders.json?name=${encodeURIComponent(`#${clean}`)}&status=any&limit=1`);
  const first = Array.isArray(result.payload.orders) ? result.payload.orders[0] : null;
  return result.ok ? normalizeShopifyOrder(first) : null;
}

/** Saves a finished OAuth connection (the shop domain is the merchant id its webhooks arrive under). */
export async function saveShopifyConnection(tenantId: string, shop: string, accessToken: string, shopName: string): Promise<void> {
  await saveStoreTokens({ tenantId, store: "shopify", accessToken, refreshToken: "", expiresAt: "", merchantId: shop, merchantName: shopName });
}
