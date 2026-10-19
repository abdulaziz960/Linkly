// The shopping cart of a chat: products a customer adds (more than one unit of each if they like), reviews with
// quantities and a total, and then pays for in one go. One cart per conversation, kept in a raw-SQL lazy table
// (tagged templates: SQLite and Postgres) so a half-filled cart survives between messages.

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { getProduct, isProductAvailable, type CatalogProduct } from "./catalog";
import { evaluateDiscount, findDiscountByCode, getCartCode, normalizeCode, setCartCode } from "./catalog-discounts";

export const MAX_UNITS_PER_LINE = 99;
export const MAX_CART_LINES = 20;
/** The pending marker meaning "the next message is a discount code", not a product waiting for its quantity. */
export const PENDING_DISCOUNT = "__discount__";

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
  await prisma.$executeRaw`DELETE FROM catalog_cart_discounts WHERE conversation_id = ${conversationId}`;
}

export type ResolvedCartLine = { product: CatalogProduct; quantity: number; lineTotal: number };
export type CartAdjustment = { position: number; name: string; from: number; to: number };
export type ResolvedCart = {
  lines: ResolvedCartLine[];
  /** Before any discount code. */
  subtotal: number;
  /** What the customer pays: the subtotal minus the discount. */
  total: number;
  currency: string;
  units: number;
  dropped: string[];
  adjusted: CartAdjustment[];
  /** The applied code and what it takes off (absent when none, or when it no longer works). */
  discount?: { id: string; code: string; amount: number };
  /** Why a code that was applied stopped working (expired, minimum no longer met, used up...). */
  discountNote?: string;
};

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
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;

  let discount: ResolvedCart["discount"];
  let discountNote: string | undefined;
  const code = lines.length ? await getCartCode(conversationId) : "";
  if (code) {
    const found = await findDiscountByCode(tenantId, code);
    const check = found ? evaluateDiscount(found, subtotal) : ({ ok: false, reason: "هذا الكود لم يعد متاحًا" } as const);
    if (found && check.ok) {
      discount = { id: found.id, code: found.code, amount: check.amount };
    } else {
      discountNote = `${code}: ${check.ok ? "" : check.reason}`;
      await setCartCode(tenantId, conversationId, "");
    }
  }

  const total = Math.round((subtotal - (discount?.amount ?? 0)) * 100) / 100;
  return { lines, subtotal, total, currency: lines[0]?.product.currency ?? "SAR", units: lines.reduce((sum, line) => sum + line.quantity, 0), dropped, adjusted, discount, discountNote };
}

export type ApplyCodeResult = { ok: true; code: string; amount: number } | { ok: false; reason: string };

/** The customer typed a code: check it against the cart as it is now, and keep it on the cart when it works. */
export async function applyDiscountCode(tenantId: string, conversationId: string, rawCode: string): Promise<ApplyCodeResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: "اكتب الكود" };
  const cart = await resolveCart(tenantId, conversationId);
  if (!cart.lines.length) return { ok: false, reason: "سلتك فارغة، أضف منتجًا أولًا" };
  const found = await findDiscountByCode(tenantId, code);
  if (!found) return { ok: false, reason: "هذا الكود غير صحيح" };
  const check = evaluateDiscount(found, cart.subtotal);
  if (!check.ok) return check;
  await setCartCode(tenantId, conversationId, found.code);
  return { ok: true, code: found.code, amount: check.amount };
}

export async function removeDiscountCode(tenantId: string, conversationId: string) {
  await setCartCode(tenantId, conversationId, "");
}

/** Forces right-to-left reading for a line that starts with Latin letters or digits (a brand name, a quantity). */
const RLM = "\u200f";

/** An amount with thousands separators ("439,130 ر.س"): big prices stay readable. */
export function formatMoney(amount: number, currency = "SAR"): string {
  const rounded = Math.round(amount * 100) / 100;
  const text = rounded.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 });
  return currency === "SAR" ? `${text} ر.س` : `${text} ${currency}`;
}

function shortName(name: string, max: number) {
  const text = name.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const RULE = "──────────";
/** WhatsApp button messages allow a body of 1024 characters: a long cart switches to short lines before that. */
export const CART_DETAILED_MAX_CHARS = 850;

/**
 * The cart as the customer reads it. Each product is its own block - its name on a line by itself, then the
 * quantity and the amounts on short lines of their own - so an English brand name next to numbers cannot scramble
 * the order of a right-to-left line. A cart too long for one message uses one short line per product.
 */
export function formatCart(cart: ResolvedCart, options: { compact?: boolean } = {}): string {
  if (!cart.lines.length) return "سلتك فارغة حاليًا.";

  const blocks = cart.lines.map((line, index) => {
    const marker = `${index + 1})`;
    const lineTotal = formatMoney(line.lineTotal, line.product.currency);
    if (options.compact) return `${RLM}${marker} ${shortName(line.product.name, 34)}${RLM} ×${line.quantity} — ${lineTotal}`;
    return [
      `${RLM}${marker} *${shortName(line.product.name, 70)}*`,
      `${RLM}      الكمية: ${line.quantity}`,
      ...(line.quantity > 1 ? [`${RLM}      سعر القطعة: ${formatMoney(line.product.price, line.product.currency)}`] : []),
      `${RLM}      المجموع: ${lineTotal}`
    ].join("\n");
  });

  const totals = cart.discount
    ? [
        `${RLM}المجموع قبل الخصم: ${formatMoney(cart.subtotal, cart.currency)}`,
        `${RLM}الخصم (${cart.discount.code}): -${formatMoney(cart.discount.amount, cart.currency)}`,
        `${RLM}*الإجمالي: ${formatMoney(cart.total, cart.currency)}*`
      ]
    : [`${RLM}*الإجمالي: ${formatMoney(cart.total, cart.currency)}*`];

  return ["*سلتك*", RULE, blocks.join(options.compact ? "\n" : "\n\n"), RULE, ...totals].join("\n");
}

/** The same lines for a placed order's message: name, quantity and the line total. */
export function formatOrderLines(cart: ResolvedCart): string {
  return cart.lines
    .map((line) => `${RLM}• *${shortName(line.product.name, 70)}*\n${RLM}   الكمية: ${line.quantity} — ${formatMoney(line.lineTotal, line.product.currency)}`)
    .join("\n");
}

/** The delivery chosen for an order, as the summary shows it. */
export type ShippingQuote = { methodName: string; city: string; fee: number; eta?: string };

/** A placed order's message body: the lines, then the totals (with the discount and the delivery when there are any). */
export function formatOrderSummary(cart: ResolvedCart, shipping?: ShippingQuote): string {
  const rows: string[] = [];
  if (cart.discount) {
    rows.push(`${RLM}المجموع قبل الخصم: ${formatMoney(cart.subtotal, cart.currency)}`);
    rows.push(`${RLM}الخصم (${cart.discount.code}): -${formatMoney(cart.discount.amount, cart.currency)}`);
  }
  if (shipping) {
    rows.push(`${RLM}التوصيل (${shipping.methodName} - ${shipping.city}): ${shipping.fee > 0 ? formatMoney(shipping.fee, cart.currency) : "مجاني"}`);
  }
  const total = Math.round((cart.total + (shipping?.fee ?? 0)) * 100) / 100;
  rows.push(`${RLM}*الإجمالي: ${formatMoney(total, cart.currency)}*`);
  return `${formatOrderLines(cart)}\n\n${rows.join("\n")}`;
}
