import { prisma } from "./prisma";
import {
  REAL_ESTATE_PROJECTS_VIEW,
  buildPlanAccess,
  isAdEventsAllowed,
  isStoreIntegrationAllowed,
  isViewLockedForPlan,
  limitReachedMessage,
  planLimit,
  upgradeMessageForAdEvents,
  upgradeMessageForStoreIntegration,
  type AdEventPlatform,
  type PlanAccessData,
  type PlanLimitKind
} from "./plan-access";
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
  const grants = await getTenantGrants(tenantId);
  if (view === REAL_ESTATE_PROJECTS_VIEW && !grants.views.includes(REAL_ESTATE_PROJECTS_VIEW)) return true;
  if (!isViewLockedForPlan(await getTenantPlanName(tenantId), view)) return false;
  // Locked by the plan - unless the platform team unlocked this page for this workspace.
  return !grants.views.includes(view);
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

/**
 * An upgrade message when the workspace's plan does not include sending events to this ad platform, else null.
 * `alreadyConfigured` keeps a workspace that set it up before the plan limit working (it just cannot add new ones).
 */
export async function adEventsBlockedMessage(tenantId: string, platform: AdEventPlatform, alreadyConfigured = false): Promise<string | null> {
  if (alreadyConfigured) return null;
  const allowed = isAdEventsAllowed(await getTenantPlanName(tenantId), platform, await getTenantGrants(tenantId));
  return allowed ? null : upgradeMessageForAdEvents(platform);
}

/** An upgrade message when the plan does not include linking an online store, else null. */
export async function storeIntegrationBlockedMessage(tenantId: string): Promise<string | null> {
  const allowed = isStoreIntegrationAllowed(await getTenantPlanName(tenantId), await getTenantGrants(tenantId));
  return allowed ? null : upgradeMessageForStoreIntegration();
}
