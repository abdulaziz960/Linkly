import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { allViewKeys } from "./permissions";
import { grantablePagesForPlan } from "./plan-access";
import type { ViewKey } from "../app/dashboard/types";

/** The pages the platform team unlocked for this workspace beyond its plan. */
export async function listTenantGrants(tenantId: string): Promise<ViewKey[]> {
  await ensureSchema();
  const rows = await prisma.tenantFeatureGrant.findMany({ where: { tenantId }, select: { viewKey: true } });
  return rows.map((row) => row.viewKey).filter((key): key is ViewKey => (allViewKeys as string[]).includes(key));
}

/**
 * Replaces a workspace's unlocked pages with `views`. Only pages the plan
 * actually locks can be granted (anything else is already open, or invalid),
 * so a grant never outlives its purpose silently: if the workspace later moves
 * to a plan that includes the page, the stored grant simply has no effect.
 */
export async function setTenantGrants(tenantId: string, views: string[], grantedBy: string, planName: string | null): Promise<ViewKey[]> {
  await ensureSchema();
  const allowed = new Set<string>(grantablePagesForPlan(planName));
  const wanted = Array.from(new Set(views)).filter((view): view is ViewKey => allowed.has(view));
  const now = new Date().toISOString();
  await prisma.$transaction([
    prisma.tenantFeatureGrant.deleteMany({ where: { tenantId, viewKey: { notIn: wanted } } }),
    ...wanted.map((view) => prisma.tenantFeatureGrant.upsert({
      where: { tenantId_viewKey: { tenantId, viewKey: view } },
      update: {},
      create: { id: `grant-${randomUUID()}`, tenantId, viewKey: view, grantedBy, createdAt: now }
    }))
  ]);
  return wanted;
}
