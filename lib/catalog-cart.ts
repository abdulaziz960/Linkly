// The shopping cart of a chat: products a customer adds (more than one unit of each if they like), reviews with
// quantities and a total, and then pays for in one go. One cart per conversation, kept in a raw-SQL lazy table
// (tagged templates: SQLite and Postgres) so a half-filled cart survives between messages.

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { formatPrice, getProduct, isProductAvailable, type CatalogProduct } from "./catalog";

export const MAX_UNITS_PER_LINE = 99;
export const MAX_CART_LINES = 20;

export type CartLine = { productId: string; quantity: number };
export type Cart = { lines: CartLine[]; pendingProductId: string };

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

function parseLines(json: string): CartLine[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({ productId: String((entry as CartLine)?.productId ?? ""), quantity: Math.floor(Number((entry as CartLine)?.quantity)) }))
      .filter((line) => line.productId && Number.isFinite(line.quantity) && line.quantity >= 1)
      .slice(0, MAX_CART_LINES);
  } catch {
    return [];
  }
}

export async function getCart(conversationId: string): Promise<Cart> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ items_json: string; pending_product_id: string }>>`SELECT items_json, pending_product_id FROM catalog_carts WHERE conversation_id = ${conversationId} LIMIT 1`;
  const row = rows[0];
  return { lines: parseLines(row?.items_json ?? "[]"), pendingProductId: row?.pending_product_id ?? "" };
}

async function saveCart(tenantId: string, conversationId: string, cart: Cart) {
  await ensureTables();
  const now = new Date().toISOString();
  const json = JSON.stringify(cart.lines);
  await prisma.$executeRaw`DELETE FROM catalog_carts WHERE conversation_id = ${conversationId}`;
  if (!cart.lines.length && !cart.pendingProductId) return;
  await prisma.$executeRaw`INSERT INTO catalog_carts (conversation_id, tenant_id, items_json, pending_product_id, updated_at) VALUES (${conversationId}, ${tenantId}, ${json}, ${cart.pendingProductId}, ${now})`;
}

/** Remembers which product the customer is choosing a quantity for (the next number they send is that quantity). */
export async function setPendingProduct(tenantId: string, conversationId: string, productId: string) {
  const cart = await getCart(conversationId);
  await saveCart(tenantId, conversationId, { ...cart, pendingProductId: productId });
}

export async function clearPendingProduct(tenantId: string, conversationId: string) {
  const cart = await getCart(conversationId);
  if (cart.pendingProductId) await saveCart(tenantId, conversationId, { ...cart, pendingProductId: "" });
}

/** The most the customer may hold of a product: a tracked stock caps it (stock -1 = not tracked). */
export function maxUnitsFor(product: Pick<CatalogProduct, "stock">): number {
  return product.stock > 0 ? Math.min(MAX_UNITS_PER_LINE, product.stock) : MAX_UNITS_PER_LINE;
}

export type AddResult = { ok: true; quantity: number; capped: boolean } | { ok: false; reason: "unavailable" | "cart-full" };

/** Adds units of a product; the same product twice becomes one line. A stock limit trims the quantity (and says so). */
export async function addToCart(tenantId: string, conversationId: string, productId: string, quantity: number): Promise<AddResult> {
  const product = await getProduct(tenantId, productId);
  if (!product || !isProductAvailable(product)) return { ok: false, reason: "unavailable" };
  const cart = await getCart(conversationId);
  const wanted = Math.max(1, Math.floor(quantity));
  const existing = cart.lines.find((line) => line.productId === productId);
  if (!existing && cart.lines.length >= MAX_CART_LINES) return { ok: false, reason: "cart-full" };

  const limit = maxUnitsFor(product);
  const total = Math.min(limit, (existing?.quantity ?? 0) + wanted);
  const capped = (existing?.quantity ?? 0) + wanted > limit;
  const lines = existing ? cart.lines.map((line) => (line.productId === productId ? { ...line, quantity: total } : line)) : [...cart.lines, { productId, quantity: total }];
  await saveCart(tenantId, conversationId, { lines, pendingProductId: "" });
  return { ok: true, quantity: total, capped };
}

/** Sets one line's quantity (1-based position as shown to the customer). 0 removes it. */
export async function setLineQuantity(tenantId: string, conversationId: string, position: number, quantity: number): Promise<boolean> {
  const cart = await getCart(conversationId);
  const index = Math.floor(position) - 1;
  if (index < 0 || index >= cart.lines.length) return false;
  const next = Math.floor(quantity);
  if (next <= 0) {
    await saveCart(tenantId, conversationId, { ...cart, lines: cart.lines.filter((_, at) => at !== index) });
    return true;
  }
  const product = await getProduct(tenantId, cart.lines[index].productId);
  const limit = product ? maxUnitsFor(product) : MAX_UNITS_PER_LINE;
  await saveCart(tenantId, conversationId, { ...cart, lines: cart.lines.map((line, at) => (at === index ? { ...line, quantity: Math.min(limit, next) } : line)) });
  return true;
}

export async function removeLine(tenantId: string, conversationId: string, position: number): Promise<boolean> {
  return setLineQuantity(tenantId, conversationId, position, 0);
}

export async function clearCart(conversationId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_carts WHERE conversation_id = ${conversationId}`;
}

export type ResolvedCartLine = { product: CatalogProduct; quantity: number; lineTotal: number };
export type CartAdjustment = { position: number; name: string; from: number; to: number };
export type ResolvedCart = { lines: ResolvedCartLine[]; total: number; currency: string; units: number; dropped: string[]; adjusted: CartAdjustment[] };

/** The cart with current prices; a product removed or sold out since it was added is dropped (and named). */
export async function resolveCart(tenantId: string, conversationId: string): Promise<ResolvedCart> {
  const cart = await getCart(conversationId);
  const lines: ResolvedCartLine[] = [];
  const dropped: string[] = [];
  const adjusted: CartAdjustment[] = [];
  for (const [index, line] of cart.lines.entries()) {
    const product = await getProduct(tenantId, line.productId);
    if (!product || !isProductAvailable(product)) {
      dropped.push(product?.name ?? "منتج");
      continue;
    }
    const quantity = Math.min(line.quantity, maxUnitsFor(product));
    // Less stock than the customer asked for (someone bought it meanwhile): they must see it before paying.
    if (quantity < line.quantity) adjusted.push({ position: index + 1, name: product.name, from: line.quantity, to: quantity });
    lines.push({ product, quantity, lineTotal: Math.round(product.price * quantity * 100) / 100 });
  }
  const total = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  return { lines, total, currency: lines[0]?.product.currency ?? "SAR", units: lines.reduce((sum, line) => sum + line.quantity, 0), dropped, adjusted };
}

/** The cart as the customer reads it: each product with its quantity and price, then the total. */
export function formatCart(cart: ResolvedCart): string {
  if (!cart.lines.length) return "🛒 سلتك فارغة حاليًا.";
  const rows = cart.lines.map((line, index) => `${index + 1}) ${line.product.name} × ${line.quantity} = ${formatPrice(line.lineTotal, line.product.currency)}`);
  return [`🛒 *سلتك*`, ...rows, "", `*الإجمالي: ${formatPrice(cart.total, cart.currency)}*`].join("\n");
}
