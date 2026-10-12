import { createHmac, timingSafeEqual } from "crypto";
import { readStoreTokens, saveStoreTokens } from "./store-connections";

/**
 * Salla adapter: OAuth, the Admin API (orders) and webhooks, normalised into the shapes the
 * store engine uses. Written from Salla's public documentation and not yet exercised against a
 * live store; every field read is defensive, and the pure parts are covered by tests.
 *
 * Needs SALLA_CLIENT_ID and SALLA_CLIENT_SECRET (from the Salla Partners app), and
 * SALLA_WEBHOOK_SECRET to verify webhooks.
 */

export const SALLA_AUTH_URL = "https://accounts.salla.sa/oauth2/auth";
export const SALLA_TOKEN_URL = "https://accounts.salla.sa/oauth2/token";
export const SALLA_USER_URL = "https://accounts.salla.sa/oauth2/user/info";
export const SALLA_API = "https://api.salla.dev/admin/v2";

export type StoreOrder = {
  id: string;
  /** The number the customer knows (reference_id), not the internal id. */
  reference: string;
  statusSlug: string;
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  total: number;
  currency: string;
  trackingNumber: string;
  trackingUrl: string;
  shippingCompany: string;
};

export type StoreCart = {
  id: string;
  customerName: string;
  customerPhone: string;
  total: number;
  currency: string;
  url: string;
};

export type StoreEvent =
  | { type: "order.created" | "order.status.updated"; merchantId: string; order: StoreOrder }
  | { type: "abandoned.cart"; merchantId: string; cart: StoreCart }
  | { type: "ignored"; merchantId: string; event: string };

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

/** Digits with the country code ("+966" + "500000111" -> "966500000111"; a Saudi local 05... gets 966). */
export function storePhone(code: unknown, mobile: unknown): string {
  const prefix = str(code).replace(/\D/g, "");
  let digits = str(mobile).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (prefix && !digits.startsWith(prefix)) digits = `${prefix}${digits.replace(/^0+/, "")}`;
  else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

export function normalizeSallaOrder(raw: unknown): StoreOrder | null {
  const order = obj(raw);
  const id = str(order.id);
  if (!id) return null;
  const status = obj(order.status);
  const customer = obj(order.customer);
  const total = obj(order.total);
  const shipments = Array.isArray(order.shipments) ? obj(order.shipments[0]) : {};
  const shipping = obj(order.shipping);
  const shipment = obj(shipping.shipment);
  const tracking = { ...shipment, ...shipments };
  const name = [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" ") || str(customer.name);
  return {
    id,
    reference: str(order.reference_id) || id,
    statusSlug: str(status.slug) || str(status.name).toLowerCase(),
    statusLabel: str(status.name) || str(status.slug),
    customerName: name,
    customerPhone: storePhone(customer.mobile_code, customer.mobile),
    total: num(total.amount) || num(order.amount) || num(order.total),
    currency: str(total.currency) || str(order.currency) || "SAR",
    trackingNumber: str(tracking.tracking_number) || str(tracking.tracking_no),
    trackingUrl: str(tracking.tracking_link) || str(tracking.tracking_url),
    shippingCompany: str(tracking.courier_name) || str(tracking.company) || str(obj(tracking.courier).name)
  };
}

export function normalizeSallaCart(raw: unknown): StoreCart | null {
  const cart = obj(raw);
  const id = str(cart.id);
  if (!id) return null;
  const customer = obj(cart.customer);
  const total = obj(cart.total);
  return {
    id,
    customerName: [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" ") || str(customer.name),
    customerPhone: storePhone(customer.mobile_code, customer.mobile),
    total: num(total.amount) || num(cart.total),
    currency: str(total.currency) || "SAR",
    url: str(cart.checkout_url) || str(cart.url)
  };
}

/** Pure: a webhook body into the engine's events. */
export function parseSallaWebhook(body: unknown): StoreEvent {
  const payload = obj(body);
  const event = str(payload.event);
  const merchantId = str(payload.merchant) || str(obj(payload.merchant).id);
  const data = obj(payload.data);
  if (event === "order.created" || event === "order.status.updated") {
    // Status updates carry the order either as `data` itself or under `data.order`.
    const order = normalizeSallaOrder(data.order ?? data);
    if (order) return { type: event, merchantId, order };
  }
  if (event === "abandoned.cart") {
    const cart = normalizeSallaCart(data.cart ?? data);
    if (cart) return { type: "abandoned.cart", merchantId, cart };
  }
  return { type: "ignored", merchantId, event };
}

/** Salla signs the raw body with HMAC-SHA256 (header X-Salla-Signature); the token strategy sends the secret as a bearer. */
export function verifySallaWebhook(rawBody: string, headers: { signature?: string | null; authorization?: string | null }, secret = process.env.SALLA_WEBHOOK_SECRET || ""): boolean {
  if (!secret) return false;
  const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const signature = (headers.signature || "").trim().toLowerCase();
  if (signature) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (equal(signature, expected)) return true;
  }
  const bearer = (headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(bearer) && equal(bearer, secret);
}

export function sallaAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(SALLA_AUTH_URL);
  url.searchParams.set("client_id", process.env.SALLA_CLIENT_ID || "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", process.env.SALLA_SCOPES || "offline_access orders.read customers.read");
  url.searchParams.set("state", state);
  return url.toString();
}

export function sallaConfigured(): boolean {
  return Boolean(process.env.SALLA_CLIENT_ID && process.env.SALLA_CLIENT_SECRET);
}

type TokenResult = { accessToken: string; refreshToken: string; expiresAt: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResult | { error: string }> {
  const body = new URLSearchParams({ client_id: process.env.SALLA_CLIENT_ID || "", client_secret: process.env.SALLA_CLIENT_SECRET || "", ...params });
  const response = await fetch(SALLA_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; message?: string } | null;
  if (!response.ok || !payload?.access_token) return { error: payload?.error_description || payload?.message || "تعذر الحصول على رمز الوصول من سلة" };
  const seconds = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 14 * 24 * 3600;
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token || "", expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

export async function exchangeSallaCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export async function fetchSallaMerchant(accessToken: string): Promise<{ id: string; name: string } | null> {
  try {
    const response = await fetch(SALLA_USER_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    const payload = await response.json().catch(() => null) as { data?: Json } | null;
    const data = obj(payload?.data);
    const merchant = obj(data.merchant);
    const id = str(merchant.id) || str(data.merchant_id);
    if (!response.ok || !id) return null;
    return { id, name: str(merchant.name) || str(merchant.username) || str(data.name) };
  } catch {
    return null;
  }
}

/** A valid access token for the workspace, refreshed (and saved) when it is about to expire. */
async function accessTokenFor(tenantId: string, forceRefresh = false): Promise<string | null> {
  const tokens = await readStoreTokens(tenantId, "salla");
  if (!tokens) return null;
  const expiring = tokens.expiresAt && Date.parse(tokens.expiresAt) - Date.now() < 5 * 60 * 1000;
  if (!forceRefresh && !expiring) return tokens.accessToken;
  if (!tokens.refreshToken) return forceRefresh ? null : tokens.accessToken;
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
  if ("error" in refreshed) return forceRefresh ? null : tokens.accessToken;
  await saveStoreTokens({ tenantId, store: "salla", accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt });
  return refreshed.accessToken;
}

async function sallaGet(tenantId: string, path: string): Promise<{ ok: boolean; status: number; payload: Json }> {
  let token = await accessTokenFor(tenantId);
  if (!token) return { ok: false, status: 401, payload: {} };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${SALLA_API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (response.status === 401 && attempt === 0) {
      const fresh = await accessTokenFor(tenantId, true);
      if (!fresh) return { ok: false, status: 401, payload: {} };
      token = fresh;
      continue;
    }
    const payload = obj(await response.json().catch(() => null));
    return { ok: response.ok, status: response.status, payload };
  }
  return { ok: false, status: 401, payload: {} };
}

/** The order the customer calls by this number, or null (not found, store not connected, API error). */
export async function findSallaOrderByReference(tenantId: string, reference: string): Promise<StoreOrder | null> {
  const clean = reference.replace(/\D/g, "");
  if (!clean) return null;
  const listed = await sallaGet(tenantId, `/orders?reference_id=${encodeURIComponent(clean)}&per_page=1`);
  const first = Array.isArray(listed.payload.data) ? listed.payload.data[0] : null;
  const summary = normalizeSallaOrder(first);
  if (!listed.ok || !summary) return null;
  // The list view may omit the shipment; the detail view has it.
  const detail = await sallaGet(tenantId, `/orders/${encodeURIComponent(summary.id)}`);
  return normalizeSallaOrder(detail.payload.data) ?? summary;
}
