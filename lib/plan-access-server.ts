import { prisma } from "./prisma";
import { buildPlanAccess, isViewLockedForPlan, limitReachedMessage, planLimit, type PlanAccessData, type PlanLimitKind } from "./plan-access";
import { getTenantGrants } from "./plan-grants";
import type { ViewKey } from "../app/dashboard/types";

/**
 * A tenant with no subscription row or an unknown plan name stays open (same
 * fail-open rule as lib/plan-channel-access.ts) - a data inconsistency must
 * never lock a paying customer out.
 */
export async function getTenantTrialState(tenantId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { status: true } });
  return subscription?.status === "تجربة";
}

export async function getTenantPlanName(tenantId: string): Promise<string | null> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { plan: true } });
  return subscription?.plan ?? null;
}

export async function isViewLockedForTenant(tenantId: string, view: ViewKey): Promise<boolean> {
  if (!isViewLockedForPlan(await getTenantPlanName(tenantId), view)) return false;
  // Locked by the plan - unless the platform team unlocked this page for this workspace.
  return !(await getTenantGrants(tenantId)).views.includes(view);
}

export async function getPlanAccessForTenant(tenantId: string): Promise<PlanAccessData> {
  const planName = await getTenantPlanName(tenantId);
  const plan = planName ? await prisma.plan.findUnique({ where: { name: planName }, select: { allowedChannels: true } }) : null;
  return buildPlanAccess(planName, plan?.allowedChannels, await getTenantTrialState(tenantId), await getTenantGrants(tenantId));
}

export class PlanLimitError extends Error {}

async function countFor(tenantId: string, kind: PlanLimitKind): Promise<number> {
  if (kind === "teams") return prisma.team.count({ where: { tenantId } });
  if (kind === "branches") return prisma.branch.count({ where: { tenantId } });
  if (kind === "products") return prisma.product.count({ where: { tenantId } });
  return prisma.knowledgeBaseEntry.count({ where: { tenantId } });
}

/** Throws PlanLimitError (with a customer-facing message) when adding `adding` more would go past the plan's cap. */
export async function assertWithinPlanLimit(tenantId: string, kind: PlanLimitKind, adding = 1): Promise<void> {
  const limit = planLimit(await getTenantPlanName(tenantId), kind, await getTenantGrants(tenantId));
  if (limit === null) return;
  if ((await countFor(tenantId, kind)) + adding > limit) throw new PlanLimitError(limitReachedMessage(kind, limit));
}
