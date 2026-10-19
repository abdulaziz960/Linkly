// Delivery for the platform's own catalog: the merchant adds shipping companies (or their own delivery) with a price,
// an optional free-shipping threshold, an estimate and the cities each one serves; at checkout the customer says
// where the order goes and pays the delivery fee with it. Not used by a workspace connected to a store (Zid, Salla,
// Shopify): the store owns shipping there.

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { isZidConnected } from "./catalog-zid";
import { readStoreTokens } from "./store-connections";

export type ShippingMethod = {
  id: string;
  name: string;
  price: number;
  /** An order of at least this much (after any discount) ships free. 0 = no free-shipping threshold. */
  freeOver: number;
  eta: string;
  /** The cities served, as the merchant wrote them. Empty = every city. */
  cities: string[];
  active: boolean;
  createdAt: string;
};

type Row = { id: string; tenant_id: string; name: string; price: number; free_over: number; eta: string; cities_json: string; active: number | bigint; created_at: string };

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Whether the workspace sells through a connected store (Zid, Salla or Shopify): shipping and the extra payment methods are the store's then. */
export async function hasConnectedStore(tenantId: string): Promise<boolean> {
  if (await isZidConnected(tenantId)) return true;
  return Boolean((await readStoreTokens(tenantId, "salla")) || (await readStoreTokens(tenantId, "shopify")));
}

function parseCities(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.map((city) => String(city).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function toMethod(row: Row): ShippingMethod {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    freeOver: Number(row.free_over),
    eta: row.eta,
    cities: parseCities(row.cities_json),
    active: Number(row.active) === 1,
    createdAt: row.created_at
  };
}

/**
 * A city as a customer or a merchant writes it, reduced so the usual spellings meet: "الرياض" / "رياض", "جدة" / "جده",
 * "أبها" / "ابها", "المدينة المنورة" / "مدينة منورة". Latin names compare case-insensitively.
 */
export function normalizeCity(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.startsWith("ال") ? word.slice(2) : word))
    .join(" ");
}

/** The cities text a merchant types (one per line, or separated by commas) as a clean, de-duplicated list. */
export function parseCitiesText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of text.split(/[\n,،؛;]+/)) {
    const city = piece.trim().replace(/\s+/g, " ");
    const key = normalizeCity(city);
    if (!city || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(city.slice(0, 40));
  }
  return out.slice(0, 300);
}

export type ShippingInput = { name?: unknown; price?: unknown; freeOver?: unknown; eta?: unknown; cities?: unknown; active?: unknown };

export function cleanShippingInput(input: ShippingInput): { ok: true; data: { name: string; price: number; freeOver: number; eta: string; cities: string[] } } | { ok: false; error: string } {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return { ok: false, error: "اسم شركة الشحن من 2 إلى 60 حرفًا" };
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0 || price > 100_000) return { ok: false, error: "سعر التوصيل غير صحيح" };
  const freeOver = input.freeOver === undefined || input.freeOver === "" || input.freeOver === null ? 0 : Number(input.freeOver);
  if (!Number.isFinite(freeOver) || freeOver < 0) return { ok: false, error: "حد الشحن المجاني غير صحيح" };
  const eta = String(input.eta ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const cities = Array.isArray(input.cities) ? parseCitiesText(input.cities.map(String).join("\n")) : parseCitiesText(String(input.cities ?? ""));
  return { ok: true, data: { name, price: Math.round(price * 100) / 100, freeOver: Math.round(freeOver * 100) / 100, eta, cities } };
}

export async function listShippingMethods(tenantId: string, options: { activeOnly?: boolean } = {}): Promise<ShippingMethod[]> {
  await ensureTables();
  const rows = options.activeOnly
    ? await prisma.$queryRaw<Row[]>`SELECT * FROM catalog_shipping_methods WHERE tenant_id = ${tenantId} AND active = 1 ORDER BY created_at ASC`
    : await prisma.$queryRaw<Row[]>`SELECT * FROM catalog_shipping_methods WHERE tenant_id = ${tenantId} ORDER BY created_at ASC`;
  return rows.map(toMethod);
}

export async function getShippingMethod(tenantId: string, id: string): Promise<ShippingMethod | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM catalog_shipping_methods WHERE tenant_id = ${tenantId} AND id = ${id} LIMIT 1`;
  return rows[0] ? toMethod(rows[0]) : null;
}

export async function createShippingMethod(tenantId: string, input: ShippingInput): Promise<{ ok: true; method: ShippingMethod } | { ok: false; error: string }> {
  const cleaned = cleanShippingInput(input);
  if (!cleaned.ok) return cleaned;
  await ensureTables();
  const id = `ship-${randomUUID()}`;
  const now = new Date().toISOString();
  const d = cleaned.data;
  await prisma.$executeRaw`INSERT INTO catalog_shipping_methods (id, tenant_id, name, price, free_over, eta, cities_json, active, created_at) VALUES (${id}, ${tenantId}, ${d.name}, ${d.price}, ${d.freeOver}, ${d.eta}, ${JSON.stringify(d.cities)}, 1, ${now})`;
  return { ok: true, method: (await getShippingMethod(tenantId, id)) as ShippingMethod };
}

export async function updateShippingMethod(tenantId: string, id: string, input: ShippingInput): Promise<{ ok: true; method: ShippingMethod } | { ok: false; error: string }> {
  const existing = await getShippingMethod(tenantId, id);
  if (!existing) return { ok: false, error: "طريقة الشحن غير موجودة" };
  const active = typeof input.active === "boolean" ? input.active : existing.active;
  // only the active switch came in: change nothing else
  const onlySwitch = input.name === undefined && input.price === undefined && input.cities === undefined;
  const cleaned = onlySwitch ? ({ ok: true, data: { name: existing.name, price: existing.price, freeOver: existing.freeOver, eta: existing.eta, cities: existing.cities } } as const) : cleanShippingInput(input);
  if (!cleaned.ok) return cleaned;
  const d = cleaned.data;
  const flag = active ? 1 : 0;
  await prisma.$executeRaw`UPDATE catalog_shipping_methods SET name = ${d.name}, price = ${d.price}, free_over = ${d.freeOver}, eta = ${d.eta}, cities_json = ${JSON.stringify(d.cities)}, active = ${flag} WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return { ok: true, method: (await getShippingMethod(tenantId, id)) as ShippingMethod };
}

export async function deleteShippingMethod(tenantId: string, id: string): Promise<boolean> {
  await ensureTables();
  const changed = await prisma.$executeRaw`DELETE FROM catalog_shipping_methods WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return Number(changed) > 0;
}

/** The active delivery options that serve this city (an option with no cities serves all). */
export function methodsForCity(methods: ShippingMethod[], city: string): ShippingMethod[] {
  const wanted = normalizeCity(city);
  if (!wanted) return [];
  return methods.filter((method) => method.active && (method.cities.length === 0 || method.cities.some((served) => normalizeCity(served) === wanted)));
}

/** Every city some active option serves (null when one of them serves every city, so there is no list to show). */
export function servedCities(methods: ShippingMethod[]): string[] | null {
  const active = methods.filter((method) => method.active);
  if (active.some((method) => method.cities.length === 0)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const method of active) {
    for (const city of method.cities) {
      const key = normalizeCity(city);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(city);
      }
    }
  }
  return out;
}

/** The delivery fee for an order whose products come to `productsTotal` (after any discount). */
export function shippingFee(method: Pick<ShippingMethod, "price" | "freeOver">, productsTotal: number): number {
  if (method.freeOver > 0 && productsTotal >= method.freeOver) return 0;
  return method.price;
}

// ---- the delivery chosen for a placed order ----

export type OrderShipping = { methodName: string; city: string; address: string; fee: number; eta: string };

export async function recordOrderShipping(orderId: string, shipping: OrderShipping) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_order_shipping WHERE order_id = ${orderId}`;
  await prisma.$executeRaw`INSERT INTO catalog_order_shipping (order_id, method_name, city, address, fee, eta) VALUES (${orderId}, ${shipping.methodName}, ${shipping.city}, ${shipping.address}, ${shipping.fee}, ${shipping.eta})`;
}

export async function getOrderShipping(orderIds: string[]): Promise<Map<string, OrderShipping>> {
  const result = new Map<string, OrderShipping>();
  if (!orderIds.length) return result;
  await ensureTables();
  const { Prisma } = await import("@prisma/client");
  for (let start = 0; start < orderIds.length; start += 200) {
    const batch = orderIds.slice(start, start + 200);
    const rows = await prisma.$queryRaw<Array<{ order_id: string; method_name: string; city: string; address: string; fee: number; eta: string }>>`SELECT order_id, method_name, city, address, fee, eta FROM catalog_order_shipping WHERE order_id IN (${Prisma.join(batch)})`;
    for (const row of rows) result.set(row.order_id, { methodName: row.method_name, city: row.city, address: row.address, fee: Number(row.fee), eta: row.eta });
  }
  return result;
}
