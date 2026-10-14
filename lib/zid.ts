import { createHash, createHmac, timingSafeEqual } from "crypto";
import { readStoreTokens, saveStoreTokens } from "./store-connections";
import { storePhone, type StoreCart, type StoreEvent, type StoreOrder } from "./salla";

/**
 * Zid adapter: OAuth, the Merchant API (orders, carts, webhook subscriptions) and webhooks, normalised
 * into the same shapes as Salla's so the store engine is shared. Written from Zid's public documentation
 * and NOT yet exercised against a live store: Zid's page for the webhook payload schemas did not expose the
 * field lists, so every field read is defensive and a webhook only carries the order/cart id we then
 * re-read through the API.
 *
 * Needs ZID_CLIENT_ID and ZID_CLIENT_SECRET (from the Zid Partner Dashboard app).
 *
 * Zid answers the token request with two values that are sent together on every call:
 *   access_token  -> X-Manager-Token (identifies the store)
 *   authorization -> Authorization (the app's token)
 * Both are kept in the one encrypted token field as JSON.
 */

export const ZID_AUTH_URL = "https://oauth.zid.sa/oauth/authorize";
export const ZID_TOKEN_URL = "https://oauth.zid.sa/oauth/token";
export const ZID_API = "https://api.zid.sa/v1";

/** Events we subscribe each connected store to. The event name travels in our own callback URL. */
export const ZID_EVENTS = ["order.create", "order.status.update", "abandoned_cart.created"] as const;
export type ZidEvent = (typeof ZID_EVENTS)[number];

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
function first(...values: unknown[]): string {
  for (const value of values) {
    const text = str(value);
    if (text) return text;
  }
  return "";
}

/** The callback address registered in the Zid app (the same one the connect flow sends). */
export function zidRedirectUri(origin = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://linklysa.io").replace(/\/$/, "")): string {
  return `${origin}/api/zid/callback`;
}

export function zidConfigured(): boolean {
  return Boolean(process.env.ZID_CLIENT_ID && process.env.ZID_CLIENT_SECRET);
}

export function zidAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(ZID_AUTH_URL);
  url.searchParams.set("client_id", process.env.ZID_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

// ---------- tokens ----------

export type ZidTokenPair = { manager: string; authorization: string };

export function packZidToken(pair: ZidTokenPair): string {
  return JSON.stringify({ m: pair.manager, a: pair.authorization });
}

export function unpackZidToken(value: string): ZidTokenPair | null {
  try {
    const parsed = JSON.parse(value) as { m?: unknown; a?: unknown };
    const manager = str(parsed.m);
    const authorization = str(parsed.a);
    return manager && authorization ? { manager, authorization } : null;
  } catch {
    return null;
  }
}

export function authorizationHeader(authorization: string): string {
  return /^bearer\s/i.test(authorization) ? authorization : `Bearer ${authorization}`;
}

type TokenResult = { token: string; refreshToken: string; expiresAt: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResult | { error: string }> {
  const body = new URLSearchParams({ client_id: process.env.ZID_CLIENT_ID || "", client_secret: process.env.ZID_CLIENT_SECRET || "", ...params });
  const response = await fetch(ZID_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(15000) });
  const payload = (await response.json().catch(() => null)) as Json | null;
  const manager = str(payload?.access_token);
  const authorization = str(payload?.authorization) || str(payload?.Authorization);
  if (!response.ok || !manager || !authorization) return { error: str(payload?.error_description) || str(payload?.message) || "تعذر الحصول على رمز الوصول من زد" };
  // Zid describes expires_in as one year; honour a different value if one is sent.
  const seconds = num(payload?.expires_in) > 0 ? num(payload?.expires_in) : 365 * 24 * 3600;
  return { token: packZidToken({ manager, authorization }), refreshToken: str(payload?.refresh_token), expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

export async function exchangeZidCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

async function pairFor(tenantId: string, forceRefresh = false): Promise<ZidTokenPair | null> {
  const tokens = await readStoreTokens(tenantId, "zid");
  if (!tokens) return null;
  const current = unpackZidToken(tokens.accessToken);
  // Refresh a month before the year is up (or on a 401), when a refresh token exists.
  const expiring = tokens.expiresAt && Date.parse(tokens.expiresAt) - Date.now() < 30 * 24 * 3600 * 1000;
  if (!forceRefresh && !expiring) return current;
  if (!tokens.refreshToken) return forceRefresh ? null : current;
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken, redirect_uri: zidRedirectUri() });
  if ("error" in refreshed) return forceRefresh ? null : current;
  await saveStoreTokens({ tenantId, store: "zid", accessToken: refreshed.token, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt });
  return unpackZidToken(refreshed.token);
}

function headersFor(pair: ZidTokenPair): Record<string, string> {
  return { Authorization: authorizationHeader(pair.authorization), "X-Manager-Token": pair.manager, "Accept-Language": "ar", Accept: "application/json" };
}

async function zidRequest(tenantId: string, method: "GET" | "POST", path: string, body?: unknown, asForm = false): Promise<{ ok: boolean; status: number; payload: Json }> {
  let pair = await pairFor(tenantId);
  if (!pair) return { ok: false, status: 401, payload: {} };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const form = asForm && body ? new FormData() : null;
    if (form) for (const [key, value] of Object.entries(body as Record<string, unknown>)) form.set(key, String(value));
    const response = await fetch(`${ZID_API}${path}`, {
      method,
      // Multipart bodies carry their own boundary header, so Content-Type is only set for JSON.
      headers: { ...headersFor(pair), ...(body && !form ? { "Content-Type": "application/json" } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(12000)
    });
    if (response.status === 401 && attempt === 0) {
      const fresh = await pairFor(tenantId, true);
      if (!fresh) return { ok: false, status: 401, payload: {} };
      pair = fresh;
      continue;
    }
    return { ok: response.ok, status: response.status, payload: obj(await response.json().catch(() => null)) };
  }
  return { ok: false, status: 401, payload: {} };
}

/** Who the connected store is, straight after the OAuth redirect (uses the fresh pair, not the saved one). */
export async function fetchZidStore(pair: ZidTokenPair): Promise<{ id: string; name: string } | null> {
  try {
    const response = await fetch(`${ZID_API}/managers/account/profile`, { headers: headersFor(pair), signal: AbortSignal.timeout(10000) });
    const payload = obj(await response.json().catch(() => null));
    const store = obj(obj(payload.user).store);
    const id = first(store.id, store.uuid);
    if (!response.ok || !id) return null;
    return { id, name: first(store.title, store.name, obj(payload.user).name) };
  } catch {
    return null;
  }
}

// ---------- normalising ----------

export function normalizeZidOrder(raw: unknown): StoreOrder | null {
  const root = obj(raw);
  // The detail view wraps the order ({ order: {...} }); a webhook may put it at the top level.
  const order = Object.keys(obj(root.order)).length ? obj(root.order) : root;
  const id = first(order.id);
  if (!id) return null;
  const status = obj(order.order_status ?? order.status);
  const customer = obj(order.customer);
  const shipping = obj(order.shipping);
  const method = obj(shipping.method);
  const tracking = obj(shipping.tracking ?? order.tracking);
  const total = obj(order.order_total ?? order.total);
  const statusCode = first(status.code, status.slug, typeof order.order_status === "string" ? order.order_status : "");
  return {
    id,
    // The number the customer knows is the order's "code"; fall back to the id.
    reference: first(order.code, order.order_number, id),
    statusSlug: statusCode.toLowerCase(),
    statusLabel: first(status.name, status.display, statusCode),
    customerName: first(customer.name, [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" ")),
    customerPhone: storePhone(customer.mobile_code ?? customer.country_code ?? customer.phone_code, first(customer.mobile, customer.phone)),
    total: num(total.value) || num(total.amount) || num(order.order_total) || num(order.total) || num(order.sub_total),
    currency: first(order.currency_code, obj(order.currency).code, total.currency, order.currency) || "SAR",
    trackingNumber: first(tracking.number, tracking.tracking_number, shipping.tracking_number, method.tracking_number, order.tracking_number),
    trackingUrl: first(tracking.url, tracking.tracking_url, shipping.tracking_url, shipping.url, method.tracking_url, order.tracking_url),
    shippingCompany: first(method.name, shipping.company, shipping.courier, order.shipping_company)
  };
}

export function normalizeZidCart(raw: unknown): StoreCart | null {
  const root = obj(raw);
  const cart = Object.keys(obj(root.cart)).length ? obj(root.cart) : root;
  const id = first(cart.id, cart.cart_id);
  if (!id) return null;
  const customer = obj(cart.customer);
  const total = obj(cart.cart_total ?? cart.total);
  return {
    id,
    customerName: first(customer.name, [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" ")),
    customerPhone: storePhone(customer.mobile_code ?? customer.country_code, first(customer.mobile, customer.phone)),
    total: num(total.value) || num(total.amount) || num(cart.cart_total) || num(cart.total),
    currency: first(cart.currency_code, obj(cart.currency).code, total.currency) || "SAR",
    url: first(cart.url, cart.cart_url, cart.checkout_url, cart.link, cart.recovery_url)
  };
}

// ---------- webhook trust ----------

function webhookKey(): string {
  const secret = process.env.ZID_WEBHOOK_SECRET || process.env.AUTH_SECRET || "";
  return createHash("sha256").update(`zid-webhook:${secret}`).digest("hex");
}

/** Zid's delivery body is not trusted for identity: the workspace and event are bound into our own callback URL. */
export function signZidWebhook(tenantId: string, event: string): string {
  return createHmac("sha256", webhookKey()).update(`${tenantId}|${event}`).digest("hex").slice(0, 40);
}

export function verifyZidWebhook(tenantId: string, event: string, signature: string): boolean {
  if (!tenantId || !event || !signature || !(process.env.ZID_WEBHOOK_SECRET || process.env.AUTH_SECRET)) return false;
  const expected = signZidWebhook(tenantId, event);
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function zidWebhookUrl(origin: string, tenantId: string, event: string): string {
  const url = new URL("/api/zid/webhook", origin);
  url.searchParams.set("t", tenantId);
  url.searchParams.set("e", event);
  url.searchParams.set("s", signZidWebhook(tenantId, event));
  return url.toString();
}

/** Pure: a delivery (known event + body) into the engine's events; ids only, the full record is re-read via the API. */
export function parseZidWebhook(event: string, body: unknown): StoreEvent {
  const payload = obj(body);
  if (event === "order.create" || event === "order.status.update") {
    const order = normalizeZidOrder(payload.order ?? payload.data ?? payload);
    if (order) return { type: event === "order.create" ? "order.created" : "order.status.updated", merchantId: "", order };
  }
  if (event === "abandoned_cart.created") {
    const cart = normalizeZidCart(payload.cart ?? payload.data ?? payload);
    if (cart) return { type: "abandoned.cart", merchantId: "", cart };
  }
  return { type: "ignored", merchantId: "", event };
}

// ---------- API ----------

/** Subscribes the connected store to our events. Returns how many subscriptions Zid accepted. */
export async function subscribeZidWebhooks(tenantId: string, origin: string): Promise<{ accepted: number; failed: number }> {
  let accepted = 0;
  let failed = 0;
  for (const event of ZID_EVENTS) {
    const result = await zidRequest(tenantId, "POST", "/managers/webhooks", {
      event,
      target_url: zidWebhookUrl(origin, tenantId, event),
      original_id: `linkly-${event}`,
      subscriber: "linkly"
    });
    if (result.ok) accepted += 1;
    else failed += 1;
  }
  return { accepted, failed };
}

export async function fetchZidOrder(tenantId: string, orderId: string): Promise<StoreOrder | null> {
  const id = orderId.replace(/\D/g, "");
  if (!id) return null;
  const result = await zidRequest(tenantId, "GET", `/managers/store/orders/${encodeURIComponent(id)}/view`);
  return result.ok ? normalizeZidOrder(result.payload) : null;
}

export async function fetchZidCart(tenantId: string, cartId: string): Promise<StoreCart | null> {
  const result = await zidRequest(tenantId, "GET", `/managers/store/abandoned-carts/${encodeURIComponent(cartId)}`);
  return result.ok ? normalizeZidCart(result.payload) : null;
}

/** The order the customer calls by this number (the order's code), or null. */
export async function findZidOrderByReference(tenantId: string, reference: string): Promise<StoreOrder | null> {
  const clean = reference.replace(/\D/g, "");
  if (!clean) return null;
  const listed = await zidRequest(tenantId, "GET", `/managers/store/orders?search=${encodeURIComponent(clean)}&per_page=10`);
  const rows = Array.isArray(listed.payload.orders) ? listed.payload.orders : Array.isArray(listed.payload.data) ? listed.payload.data : [];
  if (!listed.ok) return null;
  const match = rows.map((row) => normalizeZidOrder(row)).find((order) => order && (order.reference.replace(/\D/g, "") === clean || order.id === clean));
  if (!match) return null;
  // The list view may omit shipping and the customer's phone; the detail view has them.
  return (await fetchZidOrder(tenantId, match.id)) ?? match;
}

/** A read-only call through the workspace's connection (token refresh included). */
export async function zidApiGet(tenantId: string, path: string) {
  return zidRequest(tenantId, "GET", path);
}

// ---------- products ----------

/** A localized value ({ ar, en }) or a plain string, as a single string (Arabic first). */
function localized(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return str(value);
  const object = obj(value);
  return first(object.ar, object.en, ...Object.values(object));
}

/** One Zid product as the generic feed record the catalog importer understands (null when it has no id). */
export function zidProductToRecord(raw: unknown): Record<string, unknown> | null {
  const product = obj(raw);
  const id = first(product.id, product.uuid);
  if (!id) return null;
  const images = Array.isArray(product.images) ? product.images : [];
  const firstImage = obj(images[0]);
  const image = obj(firstImage.image);
  const price = num(product.sale_price) > 0 && num(product.sale_price) < num(product.price) ? product.sale_price : product.price;
  const quantity = product.is_infinite === true || product.quantity === null || product.quantity === undefined ? -1 : num(product.quantity);
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const url = first(product.html_url, product.url, product.permalink, product.link);
  return {
    id: `zid-${id}`,
    name: localized(product.name) || localized(product.title),
    description: localized(product.description) || localized(product.short_description),
    price: first(price, product.formatted_price),
    image_link: first(image.full_size, image.large, image.medium, image.small, firstImage.url, product.image, product.main_image),
    link: url,
    category: categories.length ? localized(obj(categories[0]).name) : "",
    sku: first(product.sku),
    quantity,
    status: product.is_published === false || product.is_draft === true ? "inactive" : "active"
  };
}

/** All products of the connected store (paged, capped), as feed records. */
export async function fetchZidProducts(tenantId: string, maxProducts = 2000): Promise<{ ok: boolean; records: Array<Record<string, unknown>>; message: string }> {
  const records: Array<Record<string, unknown>> = [];
  const pageSize = 50;
  for (let page = 1; records.length < maxProducts && page <= 80; page += 1) {
    const result = await zidRequest(tenantId, "GET", `/products/?page=${page}&page_size=${pageSize}&per_page=${pageSize}`);
    if (!result.ok) {
      if (records.length) return { ok: true, records, message: "" };
      return { ok: false, records, message: result.status === 401 || result.status === 403 ? "زد رفضت الطلب: تحقق من صلاحية المنتجات في التطبيق ثم أعد الربط." : `تعذر جلب المنتجات من زد (${result.status})` };
    }
    const rows = Array.isArray(result.payload.results) ? result.payload.results : Array.isArray(result.payload.data) ? result.payload.data : Array.isArray(result.payload.products) ? result.payload.products : [];
    const mapped = rows.map(zidProductToRecord).filter((record): record is Record<string, unknown> => record !== null);
    if (!mapped.length) break;
    records.push(...mapped);
    if (rows.length < pageSize) break;
  }
  return { ok: true, records, message: "" };
}

// ---------- coupons ----------

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A single-use percentage coupon for one customer's abandoned cart. Tries the richest body first and
 * falls back to fewer fields if Zid refuses it, so the reminder still gets a working (if less limited) code.
 * Returns null when no attempt worked.
 */
export async function createZidCoupon(tenantId: string, input: { code: string; percent: number; validHours: number; minTotal?: number }): Promise<{ code: string; limited: boolean } | null> {
  const expires = new Date(Date.now() + Math.max(1, input.validHours) * 3600_000);
  const base = { name: `Linkly ${input.code}`, code: input.code, discount_type: "p", discount: Math.min(90, Math.max(1, Math.round(input.percent))) };
  const attempts: Array<{ body: Record<string, unknown>; limited: boolean }> = [
    { body: { ...base, date_start: ymd(new Date()), date_end: ymd(expires), max_total: 1, max_per_customer: 1, ...(input.minTotal ? { minimum_cart_total: input.minTotal } : {}) }, limited: true },
    { body: { ...base, date_start: ymd(new Date()), date_end: ymd(expires) }, limited: false },
    { body: base, limited: false }
  ];
  for (const attempt of attempts) {
    const result = await zidRequest(tenantId, "POST", "/managers/store/coupons/add", attempt.body, true);
    if (result.ok) return { code: input.code, limited: attempt.limited };
  }
  return null;
}

/** An unguessable, readable one-off code ("LK-7QX2KM"). */
export function uniqueCouponCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let index = 0; index < 6; index += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `LK-${out}`;
}
