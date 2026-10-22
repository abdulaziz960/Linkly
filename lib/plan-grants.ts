import { randomUUID } from "crypto";
import { cachedFor, invalidateShortCache, SHORT_CACHE_TTL_MS } from "./short-cache";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { encodeGrantKeys, grantableForPlan, NO_GRANTS, parseGrantKeys, type Grants } from "./plan-access";
import type { ViewKey } from "../app/dashboard/types";

/** Everything the platform team unlocked for this workspace beyond its plan. */
export async function getTenantGrants(tenantId: string): Promise<Grants> {
  await ensureSchema();
  // Read by every plan check, so shared for a few seconds (lib/short-cache.ts); setTenantGrants drops it at once.
  return cachedFor(`grants:${tenantId}`, SHORT_CACHE_TTL_MS, async () => {
    const rows = await prisma.tenantFeatureGrant.findMany({ where: { tenantId }, select: { viewKey: true } });
    return rows.length ? parseGrantKeys(rows.map((row) => row.viewKey)) : NO_GRANTS;
  });
}

/** The unlocked pages only (kept for callers that only care about pages). */
export async function listTenantGrants(tenantId: string): Promise<ViewKey[]> {
  return (await getTenantGrants(tenantId)).views;
}

/**
 * Replaces a workspace's grants with `requested`. Only things the plan does
 * NOT already include can be granted (anything else is already open, or
 * invalid). Real-estate projects are the one vertical-specific page that may
 * be granted on any plan because it is hidden unless the workspace needs it.
 */
export async function setTenantGrants(tenantId: string, requested: string[], grantedBy: string, planName: string | null, allowedChannelsRaw: string | null = null): Promise<Grants> {
  await ensureSchema();
  invalidateShortCache(`grants:${tenantId}`);
  const grantable = grantableForPlan(planName, allowedChannelsRaw);
  const asked = parseGrantKeys(requested);
  const wanted: Grants = {
    views: Array.from(new Set(asked.views.filter((view) => grantable.views.includes(view)))),
    features: Array.from(new Set(asked.features.filter((feature) => grantable.features.includes(feature)))),
    channels: Array.from(new Set(asked.channels.filter((channel) => grantable.channels.includes(channel)))),
    limits: Object.fromEntries(Object.entries(asked.limits).filter(([kind]) => (grantable.limits as string[]).includes(kind))),
    numbers: Object.fromEntries(Object.entries(asked.numbers).filter(([name]) => (grantable.numbers as string[]).includes(name)))
  };
  const keys = Array.from(new Set(encodeGrantKeys(wanted)));
  const now = new Date().toISOString();
  await prisma.$transaction([
    prisma.tenantFeatureGrant.deleteMany({ where: { tenantId, viewKey: { notIn: keys } } }),
    ...keys.map((key) => prisma.tenantFeatureGrant.upsert({
      where: { tenantId_viewKey: { tenantId, viewKey: key } },
      update: {},
      create: { id: `grant-${randomUUID()}`, tenantId, viewKey: key, grantedBy, createdAt: now }
    }))
  ]);
  return parseGrantKeys(keys);
}
