import { prisma } from "../prisma";
import { ensureWorkspacesSchema } from "./schema";
import { workspacesConfigured } from "./feature";

export type WorkspaceAddon = { enabled: boolean; extraProjects: number };

export async function getWorkspaceAddon(billingTenantId: string): Promise<WorkspaceAddon> {
  if (!workspacesConfigured()) return { enabled: false, extraProjects: 0 };
  await ensureWorkspacesSchema();
  const rows = await prisma.$queryRaw<Array<{ enabled: number | bigint; extra_projects: number | bigint }>>`SELECT enabled, extra_projects FROM workspace_addons WHERE billing_tenant_id = ${billingTenantId}`;
  const row = rows[0];
  return row ? { enabled: Number(row.enabled) === 1, extraProjects: Number(row.extra_projects) } : { enabled: false, extraProjects: 0 };
}

/** Written by the platform team only (admin panel). */
export async function setWorkspaceAddon(billingTenantId: string, value: { enabled: boolean; extraProjects: number }, updatedBy: string): Promise<WorkspaceAddon> {
  await ensureWorkspacesSchema();
  const extra = Math.min(50, Math.max(0, Math.floor(value.extraProjects) || 0));
  const enabled = value.enabled ? 1 : 0;
  const now = new Date().toISOString();
  const changed = await prisma.$executeRaw`UPDATE workspace_addons SET enabled = ${enabled}, extra_projects = ${extra}, updated_by = ${updatedBy}, updated_at = ${now} WHERE billing_tenant_id = ${billingTenantId}`;
  if (!changed) await prisma.$executeRaw`INSERT INTO workspace_addons (billing_tenant_id, enabled, extra_projects, updated_by, updated_at) VALUES (${billingTenantId}, ${enabled}, ${extra}, ${updatedBy}, ${now})`;
  return { enabled: enabled === 1, extraProjects: extra };
}

