// Pickup instead of delivery for the chat catalog: from the store, or from the car (the customer gives the plate number so
// the staff can bring the order out). The merchant switches each on; the customer's choice is kept while they check out
// and then stored with the order, where the staff, the receipt and the messages read it.

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

export type PickupKind = "store" | "car";

export type PickupSettings = {
  enabled: boolean;
  inStore: boolean;
  curbside: boolean;
  /** Also ask the car's colour and type. */
  askCarDetails: boolean;
  /** A line shown with the pickup (where to park, opening hours...). */
  note: string;
};

export const DEFAULT_PICKUP: PickupSettings = { enabled: false, inStore: true, curbside: true, askCarDetails: false, note: "" };

export type OrderPickup = { kind: PickupKind; plate: string; carDetails: string };

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Pure: loose input into valid settings (pickup needs at least one way on to be on). */
export function cleanPickupSettings(input: unknown): PickupSettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const inStore = source.inStore !== false;
  const curbside = source.curbside !== false;
  const note = typeof source.note === "string" ? source.note.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 200) : "";
  return { enabled: source.enabled === true && (inStore || curbside), inStore, curbside, askCarDetails: source.askCarDetails === true, note };
}

export async function getPickupSettings(tenantId: string): Promise<PickupSettings> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ enabled: number | bigint; in_store: number | bigint; curbside: number | bigint; ask_car_details: number | bigint; note: string }>>`SELECT enabled, in_store, curbside, ask_car_details, note FROM catalog_pickup_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  const row = rows[0];
  if (!row) return DEFAULT_PICKUP;
  return cleanPickupSettings({ enabled: Number(row.enabled) === 1, inStore: Number(row.in_store) === 1, curbside: Number(row.curbside) === 1, askCarDetails: Number(row.ask_car_details) === 1, note: row.note });
}

export async function savePickupSettings(tenantId: string, input: unknown): Promise<PickupSettings> {
  await ensureTables();
  const s = cleanPickupSettings(input);
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO catalog_pickup_settings (tenant_id, enabled, in_store, curbside, ask_car_details, note, updated_at) VALUES (${tenantId}, ${s.enabled ? 1 : 0}, ${s.inStore ? 1 : 0}, ${s.curbside ? 1 : 0}, ${s.askCarDetails ? 1 : 0}, ${s.note}, ${now})
    ON CONFLICT (tenant_id) DO UPDATE SET enabled = ${s.enabled ? 1 : 0}, in_store = ${s.inStore ? 1 : 0}, curbside = ${s.curbside ? 1 : 0}, ask_car_details = ${s.askCarDetails ? 1 : 0}, note = ${s.note}, updated_at = ${now}`;
  return s;
}

/** Pure: a plate number as the customer typed it into a clean one, or null ("أ ب ج 1234", "ABC-1234"; Arabic digits become Latin). */
export function cleanPlate(text: string): string | null {
  const value = text
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length < 3 || value.length > 15) return null;
  if (!/^[\p{L}\p{N} -]+$/u.test(value)) return null;
  if (!/\p{N}/u.test(value) && value.replace(/[ -]/g, "").length < 4) return null;
  return value.toUpperCase();
}

/** Pure: free text about the car (colour and type), trimmed; "" when nothing usable. */
export function cleanCarDetails(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** How a pickup reads to the customer and the staff. */
export function pickupText(pickup: OrderPickup): string {
  if (pickup.kind === "car") return `استلام من السيارة${pickup.plate ? ` — رقم اللوحة: ${pickup.plate}` : ""}${pickup.carDetails ? ` — السيارة: ${pickup.carDetails}` : ""}`;
  return "استلام بنفسك من المحل";
}

// ---- the choice while the customer checks out ----

export async function setPickupChoice(tenantId: string, conversationId: string, pickup: OrderPickup) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_pickup_choice WHERE conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO catalog_pickup_choice (conversation_id, tenant_id, kind, plate, car_details, created_at) VALUES (${conversationId}, ${tenantId}, ${pickup.kind}, ${pickup.plate}, ${pickup.carDetails}, ${new Date().toISOString()})`;
}

export async function getPickupChoice(conversationId: string): Promise<OrderPickup | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ kind: string; plate: string; car_details: string }>>`SELECT kind, plate, car_details FROM catalog_pickup_choice WHERE conversation_id = ${conversationId} LIMIT 1`;
  const row = rows[0];
  return row ? { kind: row.kind === "car" ? "car" : "store", plate: row.plate, carDetails: row.car_details } : null;
}

export async function clearPickupChoice(conversationId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_pickup_choice WHERE conversation_id = ${conversationId}`;
}

// ---- the choice stored with a placed order ----

export async function recordOrderPickup(orderId: string, pickup: OrderPickup) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_order_pickup WHERE order_id = ${orderId}`;
  await prisma.$executeRaw`INSERT INTO catalog_order_pickup (order_id, kind, plate, car_details) VALUES (${orderId}, ${pickup.kind}, ${pickup.plate}, ${pickup.carDetails})`;
}

export async function getOrderPickup(orderIds: string[]): Promise<Map<string, OrderPickup>> {
  const result = new Map<string, OrderPickup>();
  if (!orderIds.length) return result;
  await ensureTables();
  const { Prisma } = await import("@prisma/client");
  for (let start = 0; start < orderIds.length; start += 200) {
    const batch = orderIds.slice(start, start + 200);
    const rows = await prisma.$queryRaw<Array<{ order_id: string; kind: string; plate: string; car_details: string }>>`SELECT order_id, kind, plate, car_details FROM catalog_order_pickup WHERE order_id IN (${Prisma.join(batch)})`;
    for (const row of rows) result.set(row.order_id, { kind: row.kind === "car" ? "car" : "store", plate: row.plate, carDetails: row.car_details });
  }
  return result;
}
