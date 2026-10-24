// The cashier's shifts. A shift opens with the cash in the drawer and closes with the cash counted. Sales of the shift are the
// orders created between the two; the cash that should be in the drawer is the opening cash plus the orders placed without
// online payment (someone collects those at the counter). The difference is what the cashier counted over or under.

import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { listOrders } from "./catalog";
import { buildDailyReport, todayInRiyadh, type DailyReport } from "./catalog-daily-report";
import { getPaymentMethods } from "./catalog-payment-method";

export type Shift = {
  id: string;
  openedAt: string;
  openedBy: string;
  openingCash: number;
  closedAt: string;
  closedBy: string;
  countedCash: number;
  expectedCash: number;
  /** Counted minus expected: negative = short, positive = over. Only for a closed shift. */
  difference: number;
  note: string;
};

type Row = { id: string; opened_at: string; opened_by: string; opening_cash: number; closed_at: string; closed_by: string; counted_cash: number; expected_cash: number; note: string };

const round = (value: number) => Math.round(value * 100) / 100;
const toShift = (row: Row): Shift => ({
  id: row.id,
  openedAt: row.opened_at,
  openedBy: row.opened_by,
  openingCash: Number(row.opening_cash),
  closedAt: row.closed_at,
  closedBy: row.closed_by,
  countedCash: Number(row.counted_cash),
  expectedCash: Number(row.expected_cash),
  difference: row.closed_at ? round(Number(row.counted_cash) - Number(row.expected_cash)) : 0,
  note: row.note
});

export function cleanAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000 ? round(amount) : null;
}

export async function getOpenShift(tenantId: string): Promise<Shift | null> {
  await ensureCatalogSchema();
  const rows = await prisma.$queryRaw<Row[]>`SELECT id, opened_at, opened_by, opening_cash, closed_at, closed_by, counted_cash, expected_cash, note FROM catalog_shifts WHERE tenant_id = ${tenantId} AND closed_at = '' ORDER BY opened_at DESC LIMIT 1`;
  return rows[0] ? toShift(rows[0]) : null;
}

export async function listRecentShifts(tenantId: string, limit = 20): Promise<Shift[]> {
  await ensureCatalogSchema();
  const rows = await prisma.$queryRaw<Row[]>`SELECT id, opened_at, opened_by, opening_cash, closed_at, closed_by, counted_cash, expected_cash, note FROM catalog_shifts WHERE tenant_id = ${tenantId} AND closed_at <> '' ORDER BY closed_at DESC LIMIT ${limit}`;
  return rows.map(toShift);
}

/** The sales of a shift (until `to`, default now) and the cash expected in the drawer. */
export async function shiftSummary(tenantId: string, shift: Pick<Shift, "openedAt" | "openingCash" | "closedAt">, to?: string): Promise<{ report: DailyReport; expectedCash: number }> {
  const end = to || shift.closedAt || new Date(Date.now() + 1000).toISOString();
  const orders = await listOrders(tenantId, 5000, { from: shift.openedAt, to: end });
  const report = buildDailyReport(todayInRiyadh(new Date(shift.openedAt)), orders, "", await getPaymentMethods(orders.map((order) => order.id)));
  return { report, expectedCash: round(shift.openingCash + report.followUp.total) };
}

export async function openShift(tenantId: string, by: string, openingCash: number): Promise<{ ok: true; shift: Shift } | { ok: false; error: string }> {
  if (await getOpenShift(tenantId)) return { ok: false, error: "توجد وردية مفتوحة. أقفلها أولًا." };
  const id = `shift-${randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO catalog_shifts (id, tenant_id, opened_at, opened_by, opening_cash) VALUES (${id}, ${tenantId}, ${now}, ${by.slice(0, 120)}, ${openingCash})`;
  return { ok: true, shift: (await getOpenShift(tenantId))! };
}

export async function closeShift(tenantId: string, by: string, countedCash: number, note: string): Promise<{ ok: true; shift: Shift; report: DailyReport } | { ok: false; error: string }> {
  const open = await getOpenShift(tenantId);
  if (!open) return { ok: false, error: "لا توجد وردية مفتوحة." };
  const closedAt = new Date().toISOString();
  const { report, expectedCash } = await shiftSummary(tenantId, open, closedAt);
  await prisma.$executeRaw`UPDATE catalog_shifts SET closed_at = ${closedAt}, closed_by = ${by.slice(0, 120)}, counted_cash = ${countedCash}, expected_cash = ${expectedCash}, note = ${note.replace(/\s+/g, " ").trim().slice(0, 300)} WHERE id = ${open.id} AND tenant_id = ${tenantId}`;
  const rows = await prisma.$queryRaw<Row[]>`SELECT id, opened_at, opened_by, opening_cash, closed_at, closed_by, counted_cash, expected_cash, note FROM catalog_shifts WHERE id = ${open.id} LIMIT 1`;
  return { ok: true, shift: toShift(rows[0]), report };
}
