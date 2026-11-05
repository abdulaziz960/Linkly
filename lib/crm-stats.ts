import { prisma } from "./prisma";
import { getTenantStages } from "./pipeline-stages";
import { todayInRiyadh } from "./crm-visits";

/**
 * Daily numbers for the leads page: how many customers arrived each day, how many booked a visit, how many
 * visits were scheduled for the day and how many came. A customer "arrives" the day of their first message.
 */

export type DayStats = { date: string; newCustomers: number; visitsBooked: number; visitsScheduled: number; attended: number };
export type CrmStats = { days: DayStats[]; totals: Omit<DayStats, "date">; stages: Array<{ stage: string; count: number }> };

const RIYADH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" });
/** The Riyadh calendar day of a stored ISO timestamp. */
export function riyadhDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : RIYADH.format(date);
}

export async function getCrmStats(tenantId: string, daysBack = 14, now: Date = new Date()): Promise<CrmStats> {
  const span = Math.min(90, Math.max(1, Math.floor(daysBack)));
  const today = todayInRiyadh(now);
  const dates = Array.from({ length: span }, (_, index) => new Date(new Date(`${today}T00:00:00Z`).getTime() - (span - 1 - index) * 86_400_000).toISOString().slice(0, 10));
  const first = dates[0];
  // One day of margin so Riyadh midnight (UTC+3) is never cut off by the UTC-based string compare.
  const since = new Date(new Date(`${first}T00:00:00Z`).getTime() - 86_400_000).toISOString();

  const [arrivals, visits, stageRows, stages] = await Promise.all([
    prisma.$queryRaw<Array<{ first_at: string }>>`SELECT MIN(m.created_at) AS first_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.tenant_id = ${tenantId} AND m.created_at <> '' GROUP BY m.conversation_id HAVING MIN(m.created_at) >= ${since}`,
    // The visits table is created on first use; before that there is simply nothing to count.
    prisma.$queryRaw<Array<{ visit_date: string; status: string; created_at: string }>>`SELECT visit_date, status, created_at FROM crm_visits WHERE tenant_id = ${tenantId} AND (visit_date >= ${first} OR created_at >= ${since})`.catch(() => []),
    prisma.conversation.groupBy({ by: ["pipelineStage"], where: { tenantId }, _count: { _all: true } }),
    getTenantStages(tenantId)
  ]);

  const byDate = new Map<string, DayStats>(dates.map((date) => [date, { date, newCustomers: 0, visitsBooked: 0, visitsScheduled: 0, attended: 0 }]));
  for (const row of arrivals) {
    const day = byDate.get(riyadhDay(row.first_at));
    if (day) day.newCustomers += 1;
  }
  for (const visit of visits) {
    const booked = byDate.get(riyadhDay(visit.created_at));
    if (booked) booked.visitsBooked += 1;
    if (visit.status === "ملغي") continue;
    const scheduled = byDate.get(visit.visit_date);
    if (!scheduled) continue;
    scheduled.visitsScheduled += 1;
    if (visit.status === "تم الحضور") scheduled.attended += 1;
  }

  const list = [...byDate.values()];
  const totals = list.reduce((sum, day) => ({ newCustomers: sum.newCustomers + day.newCustomers, visitsBooked: sum.visitsBooked + day.visitsBooked, visitsScheduled: sum.visitsScheduled + day.visitsScheduled, attended: sum.attended + day.attended }), { newCustomers: 0, visitsBooked: 0, visitsScheduled: 0, attended: 0 });
  const counts = new Map(stageRows.map((row) => [row.pipelineStage, row._count._all]));
  return { days: list, totals, stages: stages.map((stage) => ({ stage, count: counts.get(stage) ?? 0 })) };
}
