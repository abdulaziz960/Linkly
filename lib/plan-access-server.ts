import { prisma } from "./prisma";
import { buildPlanAccess, isViewLockedForPlan, type PlanAccessData } from "./plan-access";
import type { ViewKey } from "../app/dashboard/types";

/**
 * A tenant with no subscription row or an unknown plan name stays open (same
 * fail-open rule as lib/plan-channel-access.ts) - a data inconsistency must
 * never lock a paying customer out.
 */
export async function getTenantPlanName(tenantId: string): Promise<string | null> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { plan: true } });
  return subscription?.plan ?? null;
}

export async function isViewLockedForTenant(tenantId: string, view: ViewKey): Promise<boolean> {
  return isViewLockedForPlan(await getTenantPlanName(tenantId), view);
}

export async function getPlanAccessForTenant(tenantId: string): Promise<PlanAccessData> {
  const planName = await getTenantPlanName(tenantId);
  const plan = planName ? await prisma.plan.findUnique({ where: { name: planName }, select: { allowedChannels: true } }) : null;
  return buildPlanAccess(planName, plan?.allowedChannels);
}
