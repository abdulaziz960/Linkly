// A plan change set by the platform team for the client's NEXT renewal: the current period stays as paid, and the renewal
// (automatic, or the owner paying from /billing) is on the scheduled plan and billing cycle. It clears itself once a payment
// on that plan is confirmed.

import { prisma } from "./prisma";
import { isBillingCycle, type BillingCycle } from "./billing-pricing";

export type ScheduledPlan = { planName: string; billingCycle: BillingCycle; setBy: string; createdAt: string };

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
    tenant_id TEXT PRIMARY KEY,
    plan_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    set_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`).then(() => undefined).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function getScheduledPlan(tenantId: string): Promise<ScheduledPlan | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ plan_name: string; billing_cycle: string; set_by: string; created_at: string }>>`SELECT plan_name, billing_cycle, set_by, created_at FROM scheduled_plan_changes WHERE tenant_id = ${tenantId} LIMIT 1`;
  const row = rows[0];
  if (!row || !isBillingCycle(row.billing_cycle)) return null;
  return { planName: row.plan_name, billingCycle: row.billing_cycle, setBy: row.set_by, createdAt: row.created_at };
}

export async function setScheduledPlan(tenantId: string, input: { planName: string; billingCycle: string }, setBy: string): Promise<{ ok: true; scheduled: ScheduledPlan } | { ok: false; error: string }> {
  if (!isBillingCycle(input.billingCycle)) return { ok: false, error: "دورة الفوترة غير صالحة" };
  const plan = await prisma.plan.findFirst({ where: { name: input.planName, active: 1 } });
  if (!plan) return { ok: false, error: "الباقة غير موجودة أو غير مفعّلة" };
  await ensureTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO scheduled_plan_changes (tenant_id, plan_name, billing_cycle, set_by, created_at) VALUES (${tenantId}, ${plan.name}, ${input.billingCycle}, ${setBy.slice(0, 120)}, ${now}) ON CONFLICT (tenant_id) DO UPDATE SET plan_name = ${plan.name}, billing_cycle = ${input.billingCycle}, set_by = ${setBy.slice(0, 120)}, created_at = ${now}`;
  return { ok: true, scheduled: { planName: plan.name, billingCycle: input.billingCycle, setBy, createdAt: now } };
}

export async function clearScheduledPlan(tenantId: string) {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM scheduled_plan_changes WHERE tenant_id = ${tenantId}`;
}

/** A confirmed payment on the scheduled plan carries it out: the schedule is done. */
export async function clearScheduledPlanIfPaid(tenantId: string, paidPlanName: string) {
  const scheduled = await getScheduledPlan(tenantId);
  if (scheduled && scheduled.planName === paidPlanName) await clearScheduledPlan(tenantId);
}
