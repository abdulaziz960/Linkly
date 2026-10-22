import { prisma } from "./prisma";
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
}

/** Call after changing a user account (switching workspace, session version, disabling, role, password, ...). */
export function invalidateUserCache() {
  invalidateShortCache("user:");
}
