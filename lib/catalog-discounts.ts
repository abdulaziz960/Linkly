// Discount codes for the chat cart. A merchant creates codes (a percentage or a fixed amount, with an optional
// minimum order, usage limit and expiry); a customer applies one to the cart; the order is placed at the
// discounted total (that is what the payment link charges). A code's usage is taken when the order is placed
// and given back if the order is cancelled.

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

/** "free_item": the dearest single item in the cart is free, up to `value` (0 = no limit); what a loyalty "any free product" reward uses. */
export type DiscountKind = "percent" | "fixed" | "free_item";

export type Discount = {
  id: string;
  code: string;
  kind: DiscountKind;
  value: number;
  minOrder: number;
  /** 0 = unlimited. */
  maxUses: number;
  usedCount: number;
  /** ISO date, "" = never. */
  expiresAt: string;
  active: boolean;
  createdAt: string;
};

type Row = { id: string; tenant_id: string; code: string; kind: string; value: number; min_order: number; max_uses: number | bigint; used_count: number | bigint; expires_at: string; active: number | bigint; created_at: string };

/** The customer pays at least this much: a code never makes an order free (a payment cannot be below 1). */
export const MIN_PAYABLE = 1;
const MAX_PERCENT = 90;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

function toDiscount(row: Row): Discount {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind === "fixed" ? "fixed" : row.kind === "free_item" ? "free_item" : "percent",
    value: Number(row.value),
    minOrder: Number(row.min_order),
    maxUses: Number(row.max_uses),
    usedCount: Number(row.used_count),
    expiresAt: row.expires_at,
    active: Number(row.active) === 1,
    createdAt: row.created_at
  };
}

/** Codes are typed by customers on a phone: case does not matter, spaces and dashes around do not either. */
export function normalizeCode(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
}

export type DiscountInput = { code?: unknown; kind?: unknown; value?: unknown; minOrder?: unknown; maxUses?: unknown; expiresAt?: unknown };

export function cleanDiscountInput(input: DiscountInput): { ok: true; data: { code: string; kind: DiscountKind; value: number; minOrder: number; maxUses: number; expiresAt: string } } | { ok: false; error: string } {
  const code = normalizeCode(String(input.code ?? ""));
  if (!/^[A-Z0-9؀-ۿ_-]{3,20}$/.test(code)) return { ok: false, error: "الكود من 3 إلى 20 حرفًا أو رقمًا (بدون مسافات)" };
  const kind: DiscountKind = input.kind === "fixed" ? "fixed" : input.kind === "free_item" ? "free_item" : "percent";
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0 || (value === 0 && kind !== "free_item")) return { ok: false, error: "قيمة الخصم غير صحيحة" };
  if (kind === "percent" && value > MAX_PERCENT) return { ok: false, error: `نسبة الخصم لا تتجاوز ${MAX_PERCENT}%` };
  if (kind === "fixed" && value > 1_000_000) return { ok: false, error: "قيمة الخصم كبيرة جدًا" };
  const minOrder = input.minOrder === undefined || input.minOrder === "" || input.minOrder === null ? 0 : Number(input.minOrder);
  if (!Number.isFinite(minOrder) || minOrder < 0) return { ok: false, error: "الحد الأدنى للطلب غير صحيح" };
  const maxUses = input.maxUses === undefined || input.maxUses === "" || input.maxUses === null ? 0 : Math.floor(Number(input.maxUses));
  if (!Number.isFinite(maxUses) || maxUses < 0 || maxUses > 1_000_000) return { ok: false, error: "عدد مرات الاستخدام غير صحيح" };
  let expiresAt = "";
  if (input.expiresAt) {
    const date = new Date(String(input.expiresAt));
    if (Number.isNaN(date.getTime())) return { ok: false, error: "تاريخ الانتهاء غير صحيح" };
    // the code works through the whole last day (Riyadh time)
    expiresAt = new Date(`${date.toISOString().slice(0, 10)}T20:59:59.999Z`).toISOString();
  }
  return { ok: true, data: { code, kind, value: Math.round(value * 100) / 100, minOrder: Math.round(minOrder * 100) / 100, maxUses, expiresAt } };
}

export async function listDiscounts(tenantId: string): Promise<Discount[]> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM catalog_discounts WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
  return rows.map(toDiscount);
}

export async function findDiscountByCode(tenantId: string, code: string): Promise<Discount | null> {
  await ensureTables();
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM catalog_discounts WHERE tenant_id = ${tenantId} AND code = ${normalized} LIMIT 1`;
  return rows[0] ? toDiscount(rows[0]) : null;
}

export async function getDiscount(tenantId: string, id: string): Promise<Discount | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM catalog_discounts WHERE tenant_id = ${tenantId} AND id = ${id} LIMIT 1`;
  return rows[0] ? toDiscount(rows[0]) : null;
}

export async function createDiscount(tenantId: string, input: DiscountInput): Promise<{ ok: true; discount: Discount } | { ok: false; error: string }> {
  const cleaned = cleanDiscountInput(input);
  if (!cleaned.ok) return cleaned;
  if (await findDiscountByCode(tenantId, cleaned.data.code)) return { ok: false, error: "هذا الكود موجود مسبقًا" };
  const id = `disc-${randomUUID()}`;
  const now = new Date().toISOString();
  const d = cleaned.data;
  await prisma.$executeRaw`INSERT INTO catalog_discounts (id, tenant_id, code, kind, value, min_order, max_uses, used_count, expires_at, active, created_at) VALUES (${id}, ${tenantId}, ${d.code}, ${d.kind}, ${d.value}, ${d.minOrder}, ${d.maxUses}, 0, ${d.expiresAt}, 1, ${now})`;
  return { ok: true, discount: (await getDiscount(tenantId, id)) as Discount };
}

export async function setDiscountActive(tenantId: string, id: string, active: boolean): Promise<boolean> {
  await ensureTables();
  const flag = active ? 1 : 0;
  const changed = await prisma.$executeRaw`UPDATE catalog_discounts SET active = ${flag} WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return Number(changed) > 0;
}

export async function deleteDiscount(tenantId: string, id: string): Promise<boolean> {
  await ensureTables();
  const changed = await prisma.$executeRaw`DELETE FROM catalog_discounts WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return Number(changed) > 0;
}

export type DiscountCheck = { ok: true; amount: number } | { ok: false; reason: string };

/** Whether the code works for this subtotal right now, and how much it takes off (never below MIN_PAYABLE paid). */
export function evaluateDiscount(discount: Discount, subtotal: number, now = Date.now(), unitPrices: number[] = []): DiscountCheck {
  if (!discount.active) return { ok: false, reason: "هذا الكود غير مفعّل" };
  if (discount.expiresAt && Date.parse(discount.expiresAt) < now) return { ok: false, reason: "انتهت صلاحية هذا الكود" };
  if (discount.maxUses > 0 && discount.usedCount >= discount.maxUses) return { ok: false, reason: "تم استخدام هذا الكود الحد الأقصى من المرات" };
  if (discount.minOrder > 0 && subtotal < discount.minOrder) return { ok: false, reason: `هذا الكود يتطلب طلبًا لا يقل عن ${discount.minOrder}` };
  let raw: number;
  if (discount.kind === "free_item") {
    // The dearest single item is free (up to the limit, when there is one).
    const dearest = unitPrices.length ? Math.max(...unitPrices) : 0;
    raw = discount.value > 0 ? Math.min(dearest, discount.value) : dearest;
  } else {
    raw = discount.kind === "percent" ? (subtotal * discount.value) / 100 : discount.value;
  }
  const capped = Math.min(raw, Math.max(0, subtotal - MIN_PAYABLE));
  const amount = Math.round(capped * 100) / 100;
  if (amount <= 0) return { ok: false, reason: "لا ينطبق هذا الكود على هذا الطلب" };
  return { ok: true, amount };
}

/** Takes one use of the code, atomically (two customers cannot both take the last use). False when none is left. */
export async function redeemDiscount(tenantId: string, id: string): Promise<boolean> {
  await ensureTables();
  const changed = await prisma.$executeRaw`UPDATE catalog_discounts SET used_count = used_count + 1 WHERE tenant_id = ${tenantId} AND id = ${id} AND active = 1 AND (max_uses = 0 OR used_count < max_uses)`;
  return Number(changed) > 0;
}

export async function releaseDiscountUse(tenantId: string, id: string) {
  await ensureTables();
  await prisma.$executeRaw`UPDATE catalog_discounts SET used_count = used_count - 1 WHERE tenant_id = ${tenantId} AND id = ${id} AND used_count > 0`;
}

// ---- the code on a cart, and on a placed order ----

export async function getCartCode(conversationId: string): Promise<string> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ code: string }>>`SELECT code FROM catalog_cart_discounts WHERE conversation_id = ${conversationId} LIMIT 1`;
  return rows[0]?.code ?? "";
}

export async function setCartCode(tenantId: string, conversationId: string, code: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_cart_discounts WHERE conversation_id = ${conversationId}`;
  if (code) await prisma.$executeRaw`INSERT INTO catalog_cart_discounts (conversation_id, tenant_id, code) VALUES (${conversationId}, ${tenantId}, ${code})`;
}

export async function recordOrderDiscount(orderId: string, discount: { id: string; code: string; amount: number }) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_order_discounts WHERE order_id = ${orderId}`;
  await prisma.$executeRaw`INSERT INTO catalog_order_discounts (order_id, discount_id, code, amount) VALUES (${orderId}, ${discount.id}, ${discount.code}, ${discount.amount})`;
}

export type OrderDiscount = { discountId: string; code: string; amount: number };

export async function getOrderDiscounts(orderIds: string[]): Promise<Map<string, OrderDiscount>> {
  const result = new Map<string, OrderDiscount>();
  if (!orderIds.length) return result;
  await ensureTables();
  const { Prisma } = await import("@prisma/client");
  for (let start = 0; start < orderIds.length; start += 200) {
    const batch = orderIds.slice(start, start + 200);
    const rows = await prisma.$queryRaw<Array<{ order_id: string; discount_id: string; code: string; amount: number }>>`SELECT order_id, discount_id, code, amount FROM catalog_order_discounts WHERE order_id IN (${Prisma.join(batch)})`;
    for (const row of rows) result.set(row.order_id, { discountId: row.discount_id, code: row.code, amount: Number(row.amount) });
  }
  return result;
}

/** A cancelled order gives its code's use back (once: the record is removed). */
export async function releaseOrderDiscount(tenantId: string, orderId: string) {
  const record = (await getOrderDiscounts([orderId])).get(orderId);
  if (!record) return;
  await prisma.$executeRaw`DELETE FROM catalog_order_discounts WHERE order_id = ${orderId}`;
  await releaseDiscountUse(tenantId, record.discountId);
}
