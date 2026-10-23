// Preparation time of catalog orders. The merchant sets the usual time ("your order will be ready within 30 minutes"),
// which the customer is told when the order is paid; the staff can set another time for one order, and that is what
// the customer is told when the order moves to "preparing".

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

export type PrepSettings = { enabled: boolean; defaultMinutes: number };

export const DEFAULT_PREP: PrepSettings = { enabled: false, defaultMinutes: 30 };
export const MAX_PREP_MINUTES = 24 * 60;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Pure: a number of minutes (1 to 1440) or null. */
export function cleanPrepMinutes(value: unknown): number | null {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= MAX_PREP_MINUTES ? minutes : null;
}

/** Pure: how long, in Arabic as it follows "خلال": 1 "دقيقة واحدة", 2 "دقيقتين", 5 "5 دقائق", 30 "30 دقيقة", 60 "ساعة", 90 "ساعة ونصف", 120 "ساعتين". */
export function prepPhrase(minutes: number): string {
  if (minutes < 60) {
    if (minutes === 1) return "دقيقة واحدة";
    if (minutes === 2) return "دقيقتين";
    return minutes <= 10 ? `${minutes} دقائق` : `${minutes} دقيقة`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = hours === 1 ? "ساعة" : hours === 2 ? "ساعتين" : hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`;
  if (rest === 0) return hourText;
  if (rest === 30) return `${hourText} ونصف`;
  return `${hourText} و${rest === 1 ? "دقيقة" : rest === 2 ? "دقيقتين" : rest <= 10 ? `${rest} دقائق` : `${rest} دقيقة`}`;
}

export function prepSentence(minutes: number): string {
  return `سيتم تجهيز طلبك خلال ${prepPhrase(minutes)}`;
}

export async function getPrepSettings(tenantId: string): Promise<PrepSettings> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ enabled: number | bigint; default_minutes: number | bigint }>>`SELECT enabled, default_minutes FROM catalog_prep_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  const row = rows[0];
  if (!row) return DEFAULT_PREP;
  return { enabled: Number(row.enabled) === 1, defaultMinutes: cleanPrepMinutes(Number(row.default_minutes)) ?? DEFAULT_PREP.defaultMinutes };
}

export async function savePrepSettings(tenantId: string, input: unknown): Promise<PrepSettings> {
  await ensureTables();
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const settings: PrepSettings = { enabled: source.enabled === true, defaultMinutes: cleanPrepMinutes(source.defaultMinutes) ?? DEFAULT_PREP.defaultMinutes };
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO catalog_prep_settings (tenant_id, enabled, default_minutes, updated_at) VALUES (${tenantId}, ${settings.enabled ? 1 : 0}, ${settings.defaultMinutes}, ${now})
    ON CONFLICT (tenant_id) DO UPDATE SET enabled = ${settings.enabled ? 1 : 0}, default_minutes = ${settings.defaultMinutes}, updated_at = ${now}`;
  return settings;
}

export async function setOrderPrep(orderId: string, minutes: number) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_order_prep WHERE order_id = ${orderId}`;
  await prisma.$executeRaw`INSERT INTO catalog_order_prep (order_id, minutes, set_at) VALUES (${orderId}, ${minutes}, ${new Date().toISOString()})`;
}

export async function getOrderPrep(orderIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!orderIds.length) return result;
  await ensureTables();
  const { Prisma } = await import("@prisma/client");
  for (let start = 0; start < orderIds.length; start += 200) {
    const batch = orderIds.slice(start, start + 200);
    const rows = await prisma.$queryRaw<Array<{ order_id: string; minutes: number | bigint }>>`SELECT order_id, minutes FROM catalog_order_prep WHERE order_id IN (${Prisma.join(batch)})`;
    for (const row of rows) result.set(row.order_id, Number(row.minutes));
  }
  return result;
}
