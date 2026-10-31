import { prisma } from "./prisma";
import { workspacesConfigured } from "./workspaces/feature";
import { cachedFor, invalidateShortCache, SHORT_CACHE_TTL_MS } from "./short-cache";

export type TenantSubscriptionRow = { status: string; renewalAt: string; plan: string };

/**
 * The few subscription fields every request checks (access, plan name, trial state), read once and shared
 * for a few seconds instead of once per check (lib/short-cache.ts).
 */
export function getTenantSubscriptionRow(tenantId: string): Promise<TenantSubscriptionRow | null> {
  return cachedFor(`sub:${tenantId}`, SHORT_CACHE_TTL_MS, () =>
    prisma.subscription.findUnique({ where: { tenantId }, select: { status: true, renewalAt: true, plan: true } })
  );
}

/** Call after changing a workspace's subscription so this instance sees the change at once. */
export function invalidateTenantSubscriptionRow(tenantId: string) {
  invalidateShortCache(`sub:${tenantId}`);
  // A multi-project account's projects keep a copy of its plan: bring them in step after the account's subscription changes.
  if (workspacesConfigured()) void import("./workspaces/store").then((store) => store.syncProjectSubscriptions(tenantId)).catch(() => undefined);
}

/** Call after changing a user account (switching workspace, session version, disabling, role, password, ...). */
export function invalidateUserCache() {
  invalidateShortCache("user:");
}
