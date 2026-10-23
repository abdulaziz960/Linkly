import { createHmac, timingSafeEqual } from "crypto";
import { readStoreTokens, saveStoreTokens } from "./store-connections";
import { isDemoTenant } from "./demo-mode";
import { demoSallaRequest } from "./demo-salla";
import type { ShipTo } from "./salla-ship-to";
export { shipToProblems, splitCoordinates } from "./salla-ship-to";
export type { ShipTo } from "./salla-ship-to";

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
  url.searchParams.set("scope", process.env.SALLA_SCOPES || "offline_access orders.read_write shipping.read_write customers.read products.read");
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
  if (!response.ok || !payload?.access_token) {
    console.error("Salla token request failed", { grant: params.grant_type, status: response.status, error: payload?.error_description || payload?.message || "" });
    return { error: payload?.error_description || payload?.message || "تعذر الحصول على رمز الوصول من سلة" };
  }
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

async function sallaRequest(tenantId: string, method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<{ ok: boolean; status: number; payload: Json }> {
  // A demo workspace has a fake store: nothing leaves for Salla.
  if (await isDemoTenant(tenantId)) return demoSallaRequest(tenantId, method, path, body);
  let token = await accessTokenFor(tenantId);
  if (!token) return { ok: false, status: 401, payload: {} };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${SALLA_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000)
    });
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

function sallaGet(tenantId: string, path: string) {
  return sallaRequest(tenantId, "GET", path);
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

export type SallaStatus = { slug: string; label: string };

/** Salla's standard order statuses, used when the statuses list cannot be fetched. */
export const DEFAULT_SALLA_STATUSES: SallaStatus[] = [
  { slug: "under_review", label: "قيد المراجعة" },
  { slug: "in_progress", label: "قيد التنفيذ" },
  { slug: "completed", label: "مكتمل" },
  { slug: "delivering", label: "قيد التوصيل" },
  { slug: "delivered", label: "تم التوصيل" },
  { slug: "shipped", label: "تم الشحن" },
  { slug: "canceled", label: "ملغي" },
  { slug: "restored", label: "مسترجع" }
];

/** Pure: Salla's statuses list into slug/label pairs (custom statuses without a slug are skipped). */
export function parseSallaStatuses(payload: unknown): SallaStatus[] {
  const data = obj(payload).data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const result: SallaStatus[] = [];
  for (const item of data) {
    const entry = obj(item);
    const slug = str(entry.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push({ slug, label: str(entry.name) || slug });
  }
  return result;
}

export async function listSallaStatuses(tenantId: string): Promise<SallaStatus[]> {
  const response = await sallaGet(tenantId, "/orders/statuses");
  const parsed = response.ok ? parseSallaStatuses(response.payload) : [];
  return parsed.length ? parsed : DEFAULT_SALLA_STATUSES;
}

export async function listSallaOrders(tenantId: string, page = 1, perPage = 20): Promise<{ ok: boolean; status: number; orders: StoreOrder[] }> {
  const response = await sallaGet(tenantId, `/orders?page=${Math.max(1, Math.floor(page))}&per_page=${Math.min(50, Math.max(1, Math.floor(perPage)))}`);
  const data = Array.isArray(response.payload.data) ? response.payload.data : [];
  const orders = data.map((item) => normalizeSallaOrder(item)).filter((order): order is StoreOrder => order !== null);
  return { ok: response.ok, status: response.status, orders };
}

/** Changes the order's status in Salla. Salla then sends order.status.updated, which drives the WhatsApp notification. */
export async function updateSallaOrderStatus(tenantId: string, orderId: string, slug: string): Promise<{ ok: boolean; status: number; error: string }> {
  const id = orderId.trim();
  const cleanSlug = slug.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[a-z0-9_-]+$/i.test(cleanSlug)) return { ok: false, status: 400, error: "بيانات غير صالحة" };
  const response = await sallaRequest(tenantId, "POST", `/orders/${encodeURIComponent(id)}/status`, { slug: cleanSlug });
  if (response.ok) {
    forgetRecentSallaOrders(tenantId);
    return { ok: true, status: response.status, error: "" };
  }
  const error = obj(response.payload.error);
  const message = str(error.message) || str(response.payload.message);
  return { ok: false, status: response.status, error: response.status === 401 || response.status === 403 ? "صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحية تعديل الطلبات." : message || "رفضت سلة تغيير الحالة" };
}

export type SallaShippingCompany = { id: string; name: string; type: string };

/** Pure: the store's shipping companies (those it has activated), with how each is linked (api or manual). */
export function parseSallaShippingCompanies(payload: unknown): SallaShippingCompany[] {
  const data = obj(payload).data;
  if (!Array.isArray(data)) return [];
  const result: SallaShippingCompany[] = [];
  for (const item of data) {
    const entry = obj(item);
    const id = str(entry.id);
    if (!id) continue;
    result.push({ id, name: str(entry.name) || str(entry.company_name) || id, type: str(entry.activation_type) || "api" });
  }
  return result;
}

export async function listSallaShippingCompanies(tenantId: string): Promise<{ ok: boolean; status: number; companies: SallaShippingCompany[] }> {
  const response = await sallaGet(tenantId, "/shipping/companies?per_page=60");
  return { ok: response.ok, status: response.status, companies: parseSallaShippingCompanies(response.payload) };
}

export type SallaBranch = { id: string; name: string };

export function parseSallaBranches(payload: unknown): SallaBranch[] {
  const data = obj(payload).data;
  if (!Array.isArray(data)) return [];
  return data.map((item) => obj(item)).filter((entry) => str(entry.id)).map((entry) => ({ id: str(entry.id), name: str(entry.name) || str(entry.id) }));
}

export type ShipmentPackage = { name: string; sku: string; price: number; quantity: number; weight: number };

export type ShipmentDraft = {
  orderId: string;
  reference: string;
  paymentMethod: "cod" | "pre_paid";
  shipTo: ShipTo;
  packages: ShipmentPackage[];
  /** Required ship_to fields that the order did not carry; the employee fills them before sending. */
  missing: Array<keyof ShipTo>;
  /** A shipment the order already has (company and/or tracking); creating another would duplicate it. */
  existing: { company: string; trackingNumber: string; trackingUrl: string } | null;
};

const REQUIRED_SHIP_TO: Array<keyof ShipTo> = ["name", "email", "phone", "country", "city", "address_line", "street_number", "block", "short_address", "building_number", "additional_number", "postal_code", "lat", "lng"];

/** Pure: Salla's order detail into a shipment draft (best effort; every field read is defensive). */
export function buildShipmentDraft(raw: unknown): ShipmentDraft | null {
  const order = obj(raw);
  const id = str(order.id);
  if (!id) return null;
  const shipping = obj(order.shipping);
  const address = { ...obj(order.ship_to), ...obj(shipping.address) };
  const receiver = obj(order.receiver);
  const customer = obj(order.customer);
  const national = obj(address.national_address);
  const geo = obj(address.geo_coordinates);
  const customerName = [str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" ") || str(customer.name);
  const shipTo: ShipTo = {
    name: str(address.name) || str(receiver.name) || customerName,
    email: str(receiver.email) || str(customer.email),
    phone: storePhone(receiver.country_code ?? address.country_code ?? customer.mobile_code, receiver.phone ?? address.phone ?? customer.mobile),
    country: str(address.country_code) || str(address.country),
    city: str(address.city),
    address_line: str(address.street) || str(address.shipping_address) || str(address.description) || str(address.address_line),
    street_number: str(address.street_number),
    block: str(address.block) || str(address.district),
    short_address: str(address.short_address) || str(national.short_address),
    building_number: str(address.building_number) || str(national.building_number),
    additional_number: str(address.additional_number) || str(national.additional_number),
    postal_code: str(address.postal_code),
    lat: str(geo.lat) || str(address.lat) || str(address.latitude),
    lng: str(geo.lng) || str(address.lng) || str(address.longitude)
  };
  const items = Array.isArray(order.items) ? order.items : [];
  const packages: ShipmentPackage[] = items.map((item) => {
    const entry = obj(item);
    const amounts = obj(entry.amounts);
    const quantity = Math.max(1, Math.floor(num(entry.quantity)) || 1);
    const unit = amounts.price_without_tax ?? amounts.price ?? entry.price ?? entry.amount;
    const unitPrice = num(obj(unit).amount ?? unit) || num(obj(amounts.total).amount ?? amounts.total) / quantity;
    return {
      name: str(entry.name) || str(obj(entry.product).name) || "منتج",
      sku: str(entry.sku) || str(obj(entry.product).sku),
      price: Number.isFinite(unitPrice) ? unitPrice : 0,
      quantity,
      weight: num(entry.weight) || 1
    };
  });
  const summary = normalizeSallaOrder(raw);
  const existing = summary && (summary.trackingNumber || summary.shippingCompany || summary.trackingUrl)
    ? { company: summary.shippingCompany, trackingNumber: summary.trackingNumber, trackingUrl: summary.trackingUrl }
    : null;
  return {
    orderId: id,
    reference: str(order.reference_id) || id,
    existing,
    paymentMethod: str(order.payment_method).toLowerCase() === "cod" ? "cod" : "pre_paid",
    shipTo,
    packages,
    missing: REQUIRED_SHIP_TO.filter((key) => !shipTo[key])
  };
}

/** Pure: the POST /shipments body from a draft the employee confirmed. */
export function buildShipmentPayload(input: { courierId: string; orderId: string; paymentMethod: "cod" | "pre_paid"; shipTo: ShipTo; packages: ShipmentPackage[]; branchId?: string; overwritePending?: boolean }): Record<string, unknown> {
  const { shipTo } = input;
  const lat = Number(shipTo.lat);
  const lng = Number(shipTo.lng);
  return {
    courier_id: Number(input.courierId) || input.courierId,
    shipment_type: "shipment",
    payment_method: input.paymentMethod,
    order_id: Number(input.orderId) || input.orderId,
    ...(input.overwritePending ? { overwrite_exists_pending: true } : {}),
    packages: input.packages.map((item) => ({ name: item.name, sku: item.sku, price: item.price, quantity: item.quantity, weight: item.weight })),
    ship_from: input.branchId ? { type: "branch", branch_id: Number(input.branchId) || input.branchId } : { type: "branch" },
    ship_to: {
      name: shipTo.name,
      email: shipTo.email,
      phone: shipTo.phone,
      country: shipTo.country,
      city: shipTo.city,
      address_line: shipTo.address_line,
      street_number: shipTo.street_number,
      block: shipTo.block,
      short_address: shipTo.short_address,
      building_number: shipTo.building_number,
      additional_number: shipTo.additional_number,
      postal_code: shipTo.postal_code,
      ...(Number.isFinite(lat) && Number.isFinite(lng) && shipTo.lat && shipTo.lng ? { geo_coordinates: { lat, lng } } : {})
    }
  };
}

export async function prepareSallaShipment(tenantId: string, orderId: string): Promise<{ ok: boolean; status: number; draft: ShipmentDraft | null; companies: SallaShippingCompany[]; branches: SallaBranch[] }> {
  const id = orderId.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, status: 400, draft: null, companies: [], branches: [] };
  const [detail, companies, branches] = await Promise.all([
    sallaGet(tenantId, `/orders/${encodeURIComponent(id)}`),
    listSallaShippingCompanies(tenantId),
    sallaGet(tenantId, "/branches?per_page=60")
  ]);
  if (!detail.ok) return { ok: false, status: detail.status, draft: null, companies: [], branches: [] };
  let draft = buildShipmentDraft(detail.payload.data);
  if (draft && !draft.packages.length) {
    // Salla's order detail does not always carry the items; they have their own list.
    const items = await sallaGet(tenantId, `/orders/items?order_id=${encodeURIComponent(id)}&per_page=50`);
    const listed = items.ok && Array.isArray(items.payload.data) ? items.payload.data : [];
    if (listed.length) draft = buildShipmentDraft({ ...obj(detail.payload.data), items: listed });
  }
  return { ok: true, status: 200, draft, companies: companies.companies, branches: parseSallaBranches(branches.payload) };
}

export type CreatedShipment = { id: string; trackingNumber: string; trackingUrl: string; status: string };

export async function createSallaShipment(tenantId: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; error: string; shipment?: CreatedShipment }> {
  const response = await sallaRequest(tenantId, "POST", "/shipments", payload);
  if (response.ok) {
    forgetRecentSallaOrders(tenantId);
    const data = obj(response.payload.data);
    return { ok: true, status: response.status, error: "", shipment: { id: str(data.id), trackingNumber: str(data.tracking_number) || str(data.tracking_no), trackingUrl: str(data.tracking_link) || str(data.tracking_url), status: str(data.status) } };
  }
  const errors = obj(response.payload.error).fields ?? obj(response.payload).errors;
  const detail = errors && typeof errors === "object" ? Object.entries(obj(errors)).map(([field, message]) => `${field}: ${Array.isArray(message) ? message.join("، ") : str(message)}`).slice(0, 4).join(" | ") : "";
  const message = str(obj(response.payload.error).message) || str(response.payload.message);
  if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, error: "صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحية الشحن." };
  return { ok: false, status: response.status, error: [message || "رفضت سلة إنشاء الشحنة", detail].filter(Boolean).join(" — ") };
}

const COUNTRY_CODE_BY_PREFIX: Record<string, string> = { "966": "SA", "971": "AE", "965": "KW", "973": "BH", "968": "OM", "974": "QA", "962": "JO", "20": "EG" };

export type LocationIds = { countryId?: string; cityId?: string; districtId?: string };

/** Pure: the PUT /orders/{id} body that changes the recipient and the delivery address (items and status are not touched). */
export function buildOrderUpdatePayload(shipTo: ShipTo, ids: LocationIds = {}, options: { phone?: string; receiverFields?: Array<"name" | "email" | "phone"> } = {}): Record<string, unknown> {
  const digits = shipTo.phone.replace(/\D/g, "").replace(/^00/, "");
  const fields = options.receiverFields ?? ["name", "email", "phone"];
  const prefix = Object.keys(COUNTRY_CODE_BY_PREFIX).find((code) => digits.startsWith(code)) ?? "";
  const lat = Number(shipTo.lat);
  const lng = Number(shipTo.lng);
  const asId = (value?: string) => (value && /^\d+$/.test(value) ? Number(value) : undefined);
  const country = asId(ids.countryId);
  const city = asId(ids.cityId);
  const district = asId(ids.districtId);
  const receiver = {
      ...(fields.includes("name") ? { name: shipTo.name } : {}),
      ...(fields.includes("email") && shipTo.email ? { email: shipTo.email } : {}),
      ...(fields.includes("phone") && digits ? { phone: options.phone ?? digits, ...(prefix ? { country_code: COUNTRY_CODE_BY_PREFIX[prefix] } : {}) } : {})
  };
  return {
    ...(Object.keys(receiver).length ? { receiver } : {}),
    shipping: {
      ship_to: {
        ...(country !== undefined ? { country } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(district !== undefined ? { district } : {}),
        address_line: shipTo.address_line,
        street_number: shipTo.street_number,
        short_address: shipTo.short_address,
        building_number: shipTo.building_number,
        additional_number: shipTo.additional_number,
        postal_code: shipTo.postal_code,
        ...(shipTo.lat && shipTo.lng && Number.isFinite(lat) && Number.isFinite(lng) ? { geo_coordinates: { lat, lng } } : {})
      }
    }
  };
}

export async function getSallaOrderDraft(tenantId: string, orderId: string): Promise<{ ok: boolean; status: number; draft: ShipmentDraft | null }> {
  const id = orderId.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, status: 400, draft: null };
  const detail = await sallaGet(tenantId, `/orders/${encodeURIComponent(id)}`);
  if (!detail.ok) return { ok: false, status: detail.status, draft: null };
  return { ok: true, status: 200, draft: buildShipmentDraft(detail.payload.data) };
}

/** Changes the recipient and delivery address of an order in Salla. Salla refuses most changes once the order is completed. */
/** The ways Salla's documentation shows a phone: with the country prefix, without it, with a leading zero, with a plus. */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return [];
  const prefix = Object.keys(COUNTRY_CODE_BY_PREFIX).find((code) => digits.startsWith(code));
  const local = prefix ? digits.slice(prefix.length).replace(/^0+/, "") : digits.replace(/^0+/, "");
  return [...new Set([digits, local, `0${local}`, `+${prefix ?? ""}${local}`])];
}

export async function updateSallaOrderAddress(tenantId: string, orderId: string, shipTo: ShipTo, ids: LocationIds = {}, original?: ShipTo): Promise<{ ok: boolean; status: number; error: string }> {
  const id = orderId.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, status: 400, error: "رقم الطلب غير صالح" };
  // Only the receiver fields that were changed are sent: Salla validates the phone strictly, so an untouched phone is left out.
  const receiverFields = (["name", "email", "phone"] as const).filter((key) => (key === "phone" ? shipTo.phone.replace(/\D/g, "") !== (original?.phone ?? "").replace(/\D/g, "") : shipTo[key] !== (original?.[key] ?? "")) || !original);
  const variants = receiverFields.includes("phone") ? phoneVariants(shipTo.phone) : [""];
  let response = await sallaRequest(tenantId, "PUT", `/orders/${encodeURIComponent(id)}`, buildOrderUpdatePayload(shipTo, ids, { receiverFields, phone: variants[0] || undefined }));
  for (let index = 1; !response.ok && response.status === 422 && JSON.stringify(response.payload).includes("receiver.phone") && index < variants.length; index += 1) {
    response = await sallaRequest(tenantId, "PUT", `/orders/${encodeURIComponent(id)}`, buildOrderUpdatePayload(shipTo, ids, { receiverFields, phone: variants[index] }));
  }
  if (response.ok) {
    forgetRecentSallaOrders(tenantId);
    return { ok: true, status: response.status, error: "" };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, error: "صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحية تعديل الطلبات." };
  const errors = obj(response.payload.error).fields ?? obj(response.payload).errors;
  const detail = errors && typeof errors === "object" ? Object.entries(obj(errors)).map(([field, message]) => `${field}: ${Array.isArray(message) ? message.join("، ") : str(message)}`).slice(0, 4).join(" | ") : "";
  const message = str(obj(response.payload.error).message) || str(response.payload.message);
  return { ok: false, status: response.status, error: [message || "رفضت سلة تعديل الطلب (غالبًا لأنه مكتمل)", detail].filter(Boolean).join(" — ") };
}

export type SallaProduct = { id: string; name: string; sku: string; price: number; currency: string };

/** Pure: Salla's products list into the few fields the order form shows. */
export function parseSallaProducts(payload: unknown): SallaProduct[] {
  const data = obj(payload).data;
  if (!Array.isArray(data)) return [];
  const result: SallaProduct[] = [];
  for (const item of data) {
    const entry = obj(item);
    const id = str(entry.id);
    if (!id) continue;
    const price = obj(entry.price);
    result.push({ id, name: str(entry.name) || id, sku: str(entry.sku), price: num(price.amount ?? entry.price), currency: str(price.currency) || "SAR" });
  }
  return result;
}

export async function searchSallaProducts(tenantId: string, query: string): Promise<{ ok: boolean; status: number; products: SallaProduct[] }> {
  const keyword = query.trim().slice(0, 80);
  const response = await sallaGet(tenantId, `/products?per_page=20${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`);
  return { ok: response.ok, status: response.status, products: parseSallaProducts(response.payload) };
}

export const SALLA_PAYMENT_METHODS = ["credit_card", "mada", "bank", "cod"] as const;
export type SallaPaymentMethod = (typeof SALLA_PAYMENT_METHODS)[number];

export type NewOrderInput = {
  customer: { name: string; mobile: string; email: string };
  products: Array<{ id: string; quantity: number }>;
  acceptedMethods: SallaPaymentMethod[];
  delivery: { method: "none" | "pickup"; branchId?: string };
  couponCode?: string;
};

/** Pure: the POST /orders body for an order the customer pays through Salla's payment link (pending payment). */
export function buildNewOrderPayload(input: NewOrderInput): Record<string, unknown> {
  const digits = input.customer.mobile.replace(/\D/g, "");
  const mobile = digits ? `+${digits.startsWith("00") ? digits.slice(2) : digits}` : "";
  return {
    customer: { name: input.customer.name.trim(), mobile, email: input.customer.email.trim() },
    products: input.products.map((item) => ({ identifier_type: "id", identifier: Number(item.id) || item.id, quantity: Math.max(1, Math.floor(item.quantity) || 1) })),
    payment: { status: "pending_payment", accepted_methods: input.acceptedMethods },
    delivery_method: input.delivery.method === "pickup" ? "pickup" : null,
    ...(input.delivery.method === "pickup" && input.delivery.branchId ? { branch_id: Number(input.delivery.branchId) || input.delivery.branchId } : {}),
    ...(input.couponCode?.trim() ? { coupon_code: input.couponCode.trim() } : {})
  };
}

export type CreatedOrder = { id: string; reference: string; customerUrl: string };

export async function createSallaOrder(tenantId: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; error: string; order?: CreatedOrder }> {
  const response = await sallaRequest(tenantId, "POST", "/orders", payload);
  if (response.ok) {
    forgetRecentSallaOrders(tenantId);
    const data = obj(response.payload.data);
    return { ok: true, status: response.status, error: "", order: { id: str(data.id), reference: str(data.reference_id) || str(data.id), customerUrl: str(obj(data.urls).customer) } };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, error: "صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحيتي الطلبات والمنتجات." };
  const errors = obj(response.payload.error).fields ?? obj(response.payload).errors;
  const detail = errors && typeof errors === "object" ? Object.entries(obj(errors)).map(([field, message]) => `${field}: ${Array.isArray(message) ? message.join("، ") : str(message)}`).slice(0, 4).join(" | ") : "";
  const message = str(obj(response.payload.error).message) || str(response.payload.message);
  return { ok: false, status: response.status, error: [message || "رفضت سلة إنشاء الطلب", detail].filter(Boolean).join(" — ") };
}

export async function listSallaBranches(tenantId: string): Promise<SallaBranch[]> {
  const response = await sallaGet(tenantId, "/branches?per_page=60");
  return response.ok ? parseSallaBranches(response.payload) : [];
}

const RECENT_ORDERS_TTL_MS = 60_000;
const recentOrdersCache = new Map<string, { at: number; orders: StoreOrder[] }>();

/** The store's latest orders (a few pages), kept for a minute so opening conversations does not hit Salla every time. */
async function recentSallaOrders(tenantId: string): Promise<{ ok: boolean; status: number; orders: StoreOrder[] }> {
  const cached = recentOrdersCache.get(tenantId);
  if (cached && Date.now() - cached.at < RECENT_ORDERS_TTL_MS) return { ok: true, status: 200, orders: cached.orders };
  const orders: StoreOrder[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const listed = await listSallaOrders(tenantId, page, 50);
    if (!listed.ok) return { ok: false, status: listed.status, orders: [] };
    orders.push(...listed.orders);
    if (listed.orders.length < 50) break;
  }
  recentOrdersCache.set(tenantId, { at: Date.now(), orders });
  if (recentOrdersCache.size > 200) recentOrdersCache.delete(recentOrdersCache.keys().next().value as string);
  return { ok: true, status: 200, orders };
}

/** Pure: the orders whose phone is this phone (matched on the last 9 digits), newest first as Salla lists them. */
export function ordersForPhone(orders: StoreOrder[], phone: string, limit = 5): StoreOrder[] {
  const last9 = phone.replace(/\D/g, "").slice(-9);
  if (last9.length < 9) return [];
  return orders.filter((order) => order.customerPhone.replace(/\D/g, "").slice(-9) === last9).slice(0, limit);
}

export async function sallaOrdersForCustomer(tenantId: string, phone: string): Promise<{ ok: boolean; status: number; orders: StoreOrder[] }> {
  const recent = await recentSallaOrders(tenantId);
  return { ok: recent.ok, status: recent.status, orders: recent.ok ? ordersForPhone(recent.orders, phone) : [] };
}

/** Forgets the cached orders of a workspace (after the team changed one) so the next view is fresh. */
export function forgetRecentSallaOrders(tenantId: string): void {
  recentOrdersCache.delete(tenantId);
}

export type SallaLocation = { id: string; name: string; nameEn: string; code: string };

/** Pure: a countries / cities / districts list into id and names. */
export function parseSallaLocations(payload: unknown): SallaLocation[] {
  const data = obj(payload).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => obj(item))
    .filter((entry) => str(entry.id))
    .map((entry) => ({ id: str(entry.id), name: str(entry.name) || str(entry.name_ar) || str(entry.name_en), nameEn: str(entry.name_en) || str(entry.name), code: str(entry.code) || str(entry.country_code) || str(entry.iso_code) }));
}

/** Countries, a country's cities, or a city's districts, all pages (Salla's lists are paginated at 60). */
export async function listSallaLocations(tenantId: string, kind: "countries" | "cities" | "districts", parent = ""): Promise<{ ok: boolean; status: number; items: SallaLocation[] }> {
  if (kind !== "countries" && !/^\d+$/.test(parent)) return { ok: false, status: 400, items: [] };
  const path = kind === "countries" ? "/countries" : kind === "cities" ? `/countries/${parent}/cities` : `/cities/${parent}/districts`;
  const items: SallaLocation[] = [];
  for (let page = 1; page <= 15; page += 1) {
    const response = await sallaGet(tenantId, `${path}?per_page=60&page=${page}`);
    if (!response.ok) return { ok: false, status: response.status, items: [] };
    const batch = parseSallaLocations(response.payload);
    items.push(...batch);
    if (batch.length < 60) break;
  }
  return { ok: true, status: 200, items };
}
