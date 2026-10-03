import { assertWithinPlanLimit } from "./plan-access-server";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { decryptSecret, encryptSecret } from "./secret-storage";

export type ProductSource = "manual" | "api" | "feed";

export type CatalogProduct = {
  id: string;
  externalId: string;
  source: ProductSource;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  category: string;
  sku: string;
  stock: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  externalId?: unknown;
  name?: unknown;
  description?: unknown;
  price?: unknown;
  currency?: unknown;
  imageUrl?: unknown;
  productUrl?: unknown;
  category?: unknown;
  sku?: unknown;
  stock?: unknown;
  active?: unknown;
};

export type CleanProductInput = {
  externalId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  category: string;
  sku: string;
  stock: number;
  active: boolean;
};

export const ORDER_STATUSES = ["new", "awaiting_payment", "paid", "cancelled", "fulfilled"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export type CatalogOrderRow = {
  id: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  currency: string;
  status: OrderStatus;
  paymentUrl: string;
  createdAt: string;
  updatedAt: string;
};

const MAX_NAME = 120;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 2000;
const MAX_SHORT = 80;
const MAX_PRICE = 10_000_000;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isHttpUrl(value: string, httpsOnly: boolean): boolean {
  try {
    const url = new URL(value);
    return httpsOnly ? url.protocol === "https:" : url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Parses a price the way merchants/feeds actually write it ("199", "199.00",
 * "199.00 SAR", "1,299.50", "١٢٩٫٥٠"). Returns null when no number is found.
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
  const match = normalized.match(/\d[\d,]*(?:\.\d+)?|\.\d+/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * The single validation/normalisation gate for a product coming from the
 * dashboard form, the public API, or a feed. Returns an error message
 * (never throws) so callers can report per-row problems without aborting a
 * whole batch.
 */
export function cleanProductInput(raw: ProductInput): { ok: true; data: CleanProductInput } | { ok: false; error: string } {
  const name = text(raw.name, MAX_NAME);
  if (!name) return { ok: false, error: "اسم المنتج مطلوب" };

  const price = parsePrice(raw.price);
  if (price === null) return { ok: false, error: "السعر غير صالح" };
  if (price > MAX_PRICE) return { ok: false, error: "السعر مرتفع جدًا" };

  const imageUrl = text(raw.imageUrl, MAX_URL);
  if (imageUrl && !isHttpUrl(imageUrl, true)) return { ok: false, error: "رابط الصورة يجب أن يبدأ بـ https" };

  const productUrl = text(raw.productUrl, MAX_URL);
  if (productUrl && !isHttpUrl(productUrl, false)) return { ok: false, error: "رابط المنتج غير صالح" };

  let stock = -1;
  if (raw.stock !== undefined && raw.stock !== null && raw.stock !== "") {
    const parsed = Number(raw.stock);
    if (!Number.isInteger(parsed) || parsed < -1 || parsed > 10_000_000) return { ok: false, error: "المخزون غير صالح" };
    stock = parsed;
  }

  return {
    ok: true,
    data: {
      externalId: text(raw.externalId, MAX_SHORT * 2),
      name,
      description: text(raw.description, MAX_DESCRIPTION),
      price: Math.round(price * 100) / 100,
      currency: "SAR",
      imageUrl,
      productUrl,
      category: text(raw.category, MAX_SHORT),
      sku: text(raw.sku, MAX_SHORT),
      stock,
      active: raw.active === undefined ? true : raw.active === true || raw.active === 1 || raw.active === "1" || raw.active === "true"
    }
  };
}

type ProductRow = {
  id: string; externalId: string; source: string; name: string; description: string; price: number; currency: string;
  imageUrl: string; productUrl: string; category: string; sku: string; stock: number; active: number; createdAt: string; updatedAt: string;
};

function toProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    externalId: row.externalId,
    source: (row.source === "api" || row.source === "feed" ? row.source : "manual") as ProductSource,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    imageUrl: row.imageUrl,
    productUrl: row.productUrl,
    category: row.category,
    sku: row.sku,
    stock: row.stock,
    active: row.active === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/** A product can be offered in chat when it's active and not tracked-out-of-stock. */
export function isProductAvailable(product: Pick<CatalogProduct, "active" | "stock">): boolean {
  return product.active && product.stock !== 0;
}

export function formatPrice(price: number, currency = "SAR"): string {
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  return currency === "SAR" ? `${amount} ر.س` : `${amount} ${currency}`;
}

export async function listProducts(tenantId: string, options: { activeOnly?: boolean; limit?: number; cursor?: string } = {}) {
  await ensureSchema();
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));
  const rows = await prisma.product.findMany({
    where: { tenantId, ...(options.activeOnly ? { active: 1 } : {}) },
    orderBy: { id: "asc" },
    take: limit,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {})
  });
  return { items: rows.map(toProduct), nextCursor: rows.length === limit ? rows[rows.length - 1].id : null };
}

/** Newest-first view used by the dashboard list. */
export async function listProductsForDashboard(tenantId: string) {
  await ensureSchema();
  const rows = await prisma.product.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 1000 });
  return rows.map(toProduct);
}

/** The products the bot offers: active, in stock, newest-first, one WhatsApp list's worth. */
export async function listBotProducts(tenantId: string, limit = 10): Promise<CatalogProduct[]> {
  await ensureSchema();
  const rows = await prisma.product.findMany({
    where: { tenantId, active: 1, NOT: { stock: 0 } },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return rows.map(toProduct);
}

export async function getProduct(tenantId: string, id: string): Promise<CatalogProduct | null> {
  await ensureSchema();
  const row = await prisma.product.findFirst({ where: { tenantId, id } });
  return row ? toProduct(row) : null;
}

export async function createProduct(tenantId: string, data: CleanProductInput, source: ProductSource = "manual"): Promise<CatalogProduct> {
  await ensureSchema();
  // Throws PlanLimitError when the plan's product cap is reached (manual, API and feed creation all pass through here).
  await assertWithinPlanLimit(tenantId, "products");
  const now = new Date().toISOString();
  const row = await prisma.product.create({
    data: {
      id: `prod-${randomUUID()}`,
      tenantId,
      externalId: data.externalId,
      source,
      name: data.name,
      description: data.description,
      price: data.price,
      currency: data.currency,
      imageUrl: data.imageUrl,
      productUrl: data.productUrl,
      category: data.category,
      sku: data.sku,
      stock: data.stock,
      active: data.active ? 1 : 0,
      createdAt: now,
      updatedAt: now
    }
  });
  return toProduct(row);
}

export async function updateProduct(tenantId: string, id: string, data: CleanProductInput): Promise<CatalogProduct | null> {
  await ensureSchema();
  const existing = await prisma.product.findFirst({ where: { tenantId, id } });
  if (!existing) return null;
  const row = await prisma.product.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      price: data.price,
      imageUrl: data.imageUrl,
      productUrl: data.productUrl,
      category: data.category,
      sku: data.sku,
      stock: data.stock,
      active: data.active ? 1 : 0,
      updatedAt: new Date().toISOString()
    }
  });
  return toProduct(row);
}

export async function setProductActive(tenantId: string, id: string, active: boolean): Promise<boolean> {
  await ensureSchema();
  const result = await prisma.product.updateMany({ where: { tenantId, id }, data: { active: active ? 1 : 0, updatedAt: new Date().toISOString() } });
  return result.count > 0;
}

export async function deleteProduct(tenantId: string, idOrExternalId: string): Promise<boolean> {
  await ensureSchema();
  const row = await prisma.product.findFirst({
    where: { tenantId, OR: [{ id: idOrExternalId }, { externalId: idOrExternalId }] },
    select: { id: true }
  });
  if (!row) return false;
  await prisma.product.delete({ where: { id: row.id } });
  return true;
}

/** Deletes the given products (tenant-scoped; ids that aren't this tenant's are ignored). Returns how many were removed. */
export async function deleteProducts(tenantId: string, ids: string[]): Promise<number> {
  await ensureSchema();
  const unique = Array.from(new Set(ids.filter((id) => typeof id === "string" && id)));
  if (!unique.length) return 0;
  const result = await prisma.product.deleteMany({ where: { tenantId, id: { in: unique } } });
  return result.count;
}

/** Deletes every product of the workspace. Past orders keep their own copy of the product name/price. */
export async function deleteAllProducts(tenantId: string): Promise<number> {
  await ensureSchema();
  const result = await prisma.product.deleteMany({ where: { tenantId } });
  return result.count;
}

/**
 * Creates or updates the product with this externalId (tenant-scoped).
 * Used by the public API and the feed sync so re-sending the same product
 * updates it instead of duplicating it. A product hidden by hand in the
 * dashboard stays hidden only until the source says otherwise - `active`
 * always follows the incoming data, matching how the source treats it.
 */
export async function upsertProductByExternalId(
  tenantId: string,
  source: ProductSource,
  data: CleanProductInput
): Promise<{ product: CatalogProduct; created: boolean }> {
  await ensureSchema();
  const existing = data.externalId
    ? await prisma.product.findFirst({ where: { tenantId, externalId: data.externalId } })
    : null;

  if (!existing) {
    return { product: await createProduct(tenantId, data, source), created: true };
  }

  const row = await prisma.product.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      description: data.description,
      price: data.price,
      imageUrl: data.imageUrl,
      productUrl: data.productUrl,
      category: data.category,
      sku: data.sku,
      stock: data.stock,
      active: data.active ? 1 : 0,
      source,
      updatedAt: new Date().toISOString()
    }
  });
  return { product: toProduct(row), created: false };
}

// ---- Settings (payment toggle, gateway key, feed) ----

export type PublicCatalogSettings = {
  paymentEnabled: boolean;
  gatewayProvider: string;
  hasGatewayKey: boolean;
  gatewayKeyMode: "live" | "test" | "";
  feedUrl: string;
  feedIntervalMinutes: number;
  feedLastSyncedAt: string;
  feedLastStatus: string;
  feedLastMessage: string;
};

export async function getPublicCatalogSettings(tenantId: string): Promise<PublicCatalogSettings> {
  await ensureSchema();
  const row = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  let mode: "live" | "test" | "" = "";
  if (row?.gatewaySecretKey) {
    try {
      const key = decryptSecret(row.gatewaySecretKey);
      mode = key.startsWith("sk_live_") ? "live" : "test";
    } catch {
      mode = "";
    }
  }
  return {
    paymentEnabled: row?.paymentEnabled === 1,
    gatewayProvider: row?.gatewayProvider || "moyasar",
    hasGatewayKey: Boolean(row?.gatewaySecretKey),
    gatewayKeyMode: mode,
    feedUrl: row?.feedUrl || "",
    feedIntervalMinutes: row?.feedIntervalMinutes || 360,
    feedLastSyncedAt: row?.feedLastSyncedAt || "",
    feedLastStatus: row?.feedLastStatus || "",
    feedLastMessage: row?.feedLastMessage || ""
  };
}

/** Server-only: the decrypted merchant gateway key, or "" when payment isn't usable. */
export async function getMerchantGatewayKey(tenantId: string): Promise<string> {
  await ensureSchema();
  const row = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  if (!row || row.paymentEnabled !== 1 || !row.gatewaySecretKey) return "";
  try {
    return decryptSecret(row.gatewaySecretKey);
  } catch {
    return "";
  }
}

/** Server-only: the decrypted key regardless of the payment toggle (webhook re-verification). */
export async function getMerchantGatewayKeyForVerification(tenantId: string): Promise<string> {
  await ensureSchema();
  const row = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  if (!row?.gatewaySecretKey) return "";
  try {
    return decryptSecret(row.gatewaySecretKey);
  } catch {
    return "";
  }
}

export const GATEWAY_KEY_PATTERN = /^sk_(live|test)_[A-Za-z0-9]{16,200}$/;

export async function saveCatalogSettings(
  tenantId: string,
  patch: { paymentEnabled?: boolean; gatewaySecretKey?: string; clearGatewayKey?: boolean; feedUrl?: string; feedIntervalMinutes?: number }
) {
  await ensureSchema();
  const existing = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  const now = new Date().toISOString();

  const data: {
    paymentEnabled?: number;
    gatewaySecretKey?: string;
    feedUrl?: string;
    feedIntervalMinutes?: number;
  } = {};
  if (patch.paymentEnabled !== undefined) data.paymentEnabled = patch.paymentEnabled ? 1 : 0;
  if (patch.clearGatewayKey) data.gatewaySecretKey = "";
  else if (patch.gatewaySecretKey) data.gatewaySecretKey = encryptSecret(patch.gatewaySecretKey);
  if (patch.feedUrl !== undefined) data.feedUrl = patch.feedUrl;
  if (patch.feedIntervalMinutes !== undefined) data.feedIntervalMinutes = patch.feedIntervalMinutes;

  // Payment can never be "on" without a key to take it with.
  const effectiveKey = data.gatewaySecretKey !== undefined ? data.gatewaySecretKey : existing?.gatewaySecretKey || "";
  const effectivePayment = data.paymentEnabled !== undefined ? data.paymentEnabled : existing?.paymentEnabled || 0;
  if (!effectiveKey && effectivePayment === 1) data.paymentEnabled = 0;

  await prisma.catalogSetting.upsert({
    where: { tenantId },
    update: { ...data, updatedAt: now },
    create: { tenantId, ...data, updatedAt: now }
  });
}

// ---- Orders ----

function toOrder(row: {
  id: string; conversationId: string; customerName: string; customerPhone: string; productId: string; productName: string;
  unitPrice: number; quantity: number; total: number; currency: string; status: string; paymentUrl: string; createdAt: string; updatedAt: string;
}): CatalogOrderRow {
  return {
    id: row.id,
    conversationId: row.conversationId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    productId: row.productId,
    productName: row.productName,
    unitPrice: row.unitPrice,
    quantity: row.quantity,
    total: row.total,
    currency: row.currency,
    status: (ORDER_STATUSES as readonly string[]).includes(row.status) ? (row.status as OrderStatus) : "new",
    paymentUrl: row.paymentUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function createOrder(input: {
  tenantId: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  product: CatalogProduct;
  quantity?: number;
  status: OrderStatus;
}): Promise<CatalogOrderRow> {
  await ensureSchema();
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const now = new Date().toISOString();
  const row = await prisma.catalogOrder.create({
    data: {
      id: `ord-${randomUUID()}`,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerName: input.customerName.slice(0, 120),
      customerPhone: input.customerPhone.slice(0, 40),
      productId: input.product.id,
      productName: input.product.name,
      unitPrice: input.product.price,
      quantity,
      total: Math.round(input.product.price * quantity * 100) / 100,
      currency: input.product.currency,
      status: input.status,
      createdAt: now,
      updatedAt: now
    }
  });
  return toOrder(row);
}

export async function listOrders(tenantId: string, limit = 200): Promise<CatalogOrderRow[]> {
  await ensureSchema();
  const rows = await prisma.catalogOrder.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toOrder);
}

/** Gives a cancelled order's units back to products that track stock (stock >= 0). */
export async function restockOrderUnits(tenantId: string, productId: string, quantity: number) {
  await prisma.product.updateMany({ where: { id: productId, tenantId, stock: { gte: 0 } }, data: { stock: { increment: quantity } } });
}

export async function updateOrderStatus(tenantId: string, id: string, status: OrderStatus): Promise<boolean> {
  await ensureSchema();
  const existing = await prisma.catalogOrder.findFirst({ where: { tenantId, id } });
  if (!existing) return false;
  await prisma.catalogOrder.update({ where: { id }, data: { status, updatedAt: new Date().toISOString() } });
  if (status === "cancelled" && existing.status !== "cancelled") await restockOrderUnits(tenantId, existing.productId, existing.quantity);
  return true;
}
