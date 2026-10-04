import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { encodeGrantKeys, grantableForPlan, NO_GRANTS, parseGrantKeys, type Grants } from "./plan-access";
import type { ViewKey } from "../app/dashboard/types";

/** Everything the platform team unlocked for this workspace beyond its plan. */
export async function getTenantGrants(tenantId: string): Promise<Grants> {
  await ensureSchema();
  const rows = await prisma.tenantFeatureGrant.findMany({ where: { tenantId }, select: { viewKey: true } });
  return rows.length ? parseGrantKeys(rows.map((row) => row.viewKey)) : NO_GRANTS;
}

/** The unlocked pages only (kept for callers that only care about pages). */
export async function listTenantGrants(tenantId: string): Promise<ViewKey[]> {
  return (await getTenantGrants(tenantId)).views;
}

/**
 * Replaces a workspace's grants with `requested`. Only things the plan does
 * NOT already include can be granted (anything else is already open, or
 * invalid), so a grant never outlives its purpose silently: if the workspace
 * later moves to a plan that includes it, the stored grant simply has no effect.
 */
export async function setTenantGrants(tenantId: string, requested: string[], grantedBy: string, planName: string | null, allowedChannelsRaw: string | null = null): Promise<Grants> {
  await ensureSchema();
  const grantable = grantableForPlan(planName, allowedChannelsRaw);
  const asked = parseGrantKeys(requested);
  const wanted: Grants = {
    views: asked.views.filter((view) => grantable.views.includes(view)),
    features: asked.features.filter((feature) => grantable.features.includes(feature)),
    channels: asked.channels.filter((channel) => grantable.channels.includes(channel)),
    limits: asked.limits.filter((kind) => grantable.limits.includes(kind))
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
