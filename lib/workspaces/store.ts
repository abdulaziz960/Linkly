import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { cachedFor, invalidateShortCache } from "../short-cache";
import { ensureWorkspacesSchema } from "./schema";
import { projectQuota, workspacesAllowedFor, workspacesConfigured } from "./feature";
import { getWorkspaceAddon } from "./addon-store";

export const PROJECT_COLORS = ["#178a82", "#8e6bbf", "#c9831b", "#d9534f", "#2563eb", "#2e9e6b", "#c0368a", "#4a5568"];

export type ProjectRow = {
  id: string;
  groupId: string;
  tenantId: string;
  name: string;
  color: string;
  position: number;
  archived: boolean;
  createdAt: string;
  /** The original account (billing tenant) is the first project. */
  primary: boolean;
};

export type GroupContext = { groupId: string; billingTenantId: string; name: string; projects: ProjectRow[] };

type RawProject = { id: string; group_id: string; tenant_id: string; name: string; color: string; position: number | bigint; archived: number | bigint; created_at: string };

const toRow = (raw: RawProject, billingTenantId: string): ProjectRow => ({
  id: raw.id,
  groupId: raw.group_id,
  tenantId: raw.tenant_id,
  name: raw.name,
  color: raw.color,
  position: Number(raw.position),
  archived: Number(raw.archived) === 1,
  createdAt: raw.created_at,
  primary: raw.tenant_id === billingTenantId
});

export function invalidateWorkspaceCache() {
  invalidateShortCache("ws:");
}

/**
 * The group a tenant belongs to (as a project or as the billing account), or null. Always read fresh: the pages that show or change
 * projects must never see an older answer than the one just written. Never touches the database unless the feature is configured.
 */
export async function getGroupContext(tenantId: string): Promise<GroupContext | null> {
  if (!tenantId || !workspacesConfigured()) return null;
  await ensureWorkspacesSchema();
  const own = await prisma.$queryRaw<Array<{ group_id: string }>>`SELECT group_id FROM workspace_projects WHERE tenant_id = ${tenantId}`;
  let groupId = own[0]?.group_id;
  if (!groupId) {
    const asBilling = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM workspace_groups WHERE billing_tenant_id = ${tenantId}`;
    groupId = asBilling[0]?.id;
  }
  if (!groupId) return null;
  const groups = await prisma.$queryRaw<Array<{ id: string; billing_tenant_id: string; name: string }>>`SELECT id, billing_tenant_id, name FROM workspace_groups WHERE id = ${groupId}`;
  const group = groups[0];
  if (!group) return null;
  const projects = await prisma.$queryRaw<RawProject[]>`SELECT * FROM workspace_projects WHERE group_id = ${groupId} ORDER BY position ASC, created_at ASC`;
  return { groupId: group.id, billingTenantId: group.billing_tenant_id, name: group.name, projects: projects.map((row) => toRow(row, group.billing_tenant_id)) };
}

/**
 * The account that holds the subscription and the shared message credit for a tenant. A tenant outside any group is its own billing
 * account. Read on hot paths (every message of a campaign), so the answer is remembered for a short while: a project's billing account
 * never changes once it exists, and a project created a moment ago has not sent anything yet.
 */
export async function billingTenantFor(tenantId: string): Promise<string> {
  if (!workspacesConfigured() || !tenantId) return tenantId;
  return cachedFor(`ws:billing:${tenantId}`, 30000, async () => {
    await ensureWorkspacesSchema();
    const rows = await prisma.$queryRaw<Array<{ billing_tenant_id: string }>>`SELECT g.billing_tenant_id AS billing_tenant_id FROM workspace_projects p JOIN workspace_groups g ON g.id = p.group_id WHERE p.tenant_id = ${tenantId}`;
    return rows[0]?.billing_tenant_id ?? tenantId;
  });
}

/** True for a project that is NOT the billing account: it has no subscription of its own to charge, renew or expire. */
export async function isProjectChild(tenantId: string): Promise<boolean> {
  if (!workspacesConfigured()) return false;
  return (await billingTenantFor(tenantId)) !== tenantId;
}

/** Server-side decision: may this tenant (as billing account or as one of its projects) use workspaces right now? */
export async function workspacesEnabledForTenant(tenantId: string): Promise<boolean> {
  if (!workspacesConfigured()) return false;
  const billing = (await getGroupContext(tenantId))?.billingTenantId ?? tenantId;
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: billing }, select: { plan: true, status: true } });
  if (!subscription) return false;
  const addon = await getWorkspaceAddon(billing);
  return workspacesAllowedFor(billing, subscription.plan, addon.enabled);
}

/** Creates the group (and the primary project = the original account) the first time the owner of an enabled account uses the feature. */
export async function ensureGroupForBilling(billingTenantId: string, accountName: string): Promise<GroupContext> {
  await ensureWorkspacesSchema();
  const existing = await getGroupContext(billingTenantId);
  if (existing) return existing;
  const now = new Date().toISOString();
  // Several requests can arrive at once on first use (the page and its API calls): the first one wins, the others read what it made.
  await prisma.$executeRaw`INSERT INTO workspace_groups (id, billing_tenant_id, name, created_at) VALUES (${`wsg-${randomUUID()}`}, ${billingTenantId}, ${accountName}, ${now}) ON CONFLICT (billing_tenant_id) DO NOTHING`;
  const group = (await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM workspace_groups WHERE billing_tenant_id = ${billingTenantId}`)[0];
  if (!group) throw new Error("تعذر إنشاء مساحات العمل");
  await prisma.$executeRaw`INSERT INTO workspace_projects (id, group_id, tenant_id, name, color, position, archived, created_at) VALUES (${`wsp-${randomUUID()}`}, ${group.id}, ${billingTenantId}, ${accountName}, ${PROJECT_COLORS[0]}, 0, 0, ${now}) ON CONFLICT (tenant_id) DO NOTHING`;
  invalidateWorkspaceCache();
  const created = await getGroupContext(billingTenantId);
  if (!created) throw new Error("تعذر إنشاء مساحات العمل");
  return created;
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 60) : "";
}

function cleanColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

export class WorkspaceInputError extends Error {}

/**
 * A new project is a full workspace of its own: a new tenant with the owner as its account owner, a copy of the account's plan
 * (kept in step with it, see syncProjectSubscriptions) and the same view grants. It never gets its own price, card or renewal.
 */
export async function createProject(input: { billingTenantId: string; accountName: string; owner: { id: string; name: string; email: string }; name: unknown; color?: unknown }): Promise<ProjectRow> {
  const name = cleanName(input.name);
  if (name.length < 2) throw new WorkspaceInputError("اسم المشروع مطلوب (حرفان على الأقل)");
  const group = await ensureGroupForBilling(input.billingTenantId, input.accountName);
  const active = group.projects.filter((project) => !project.archived);
  if (active.some((project) => project.name.toLowerCase() === name.toLowerCase())) throw new WorkspaceInputError("يوجد مشروع بنفس الاسم");

  const billing = await prisma.subscription.findUnique({ where: { tenantId: input.billingTenantId } });
  if (!billing) throw new WorkspaceInputError("اشتراك الحساب غير موجود");
  // The account's own workspace counts as one; the plan includes some extra projects and the rest are bought (admin panel).
  const quota = projectQuota(billing.plan, (await getWorkspaceAddon(input.billingTenantId)).extraProjects);
  if (active.length >= quota.maxProjects) throw new WorkspaceInputError("وصلت للحد الأقصى من المشاريع في باقتك. تواصل معنا لإضافة مشاريع.");

  const tenantId = `tenant-${randomUUID()}`;
  const projectId = `wsp-${randomUUID()}`;
  const now = new Date().toISOString();
  const color = cleanColor(input.color, PROJECT_COLORS[group.projects.length % PROJECT_COLORS.length]);
  const position = group.projects.reduce((max, project) => Math.max(max, project.position), 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.employee.create({
      data: {
        id: `emp-${randomUUID()}`, name: input.owner.name, email: input.owner.email, role: "مالك الحساب", status: "غير متصل",
        permissions: "الكل", initial: input.owner.name.slice(0, 1) || "ع", tenantId, userId: input.owner.id
      }
    });
    await tx.subscription.create({
      data: {
        id: `sub-${tenantId}`, tenantId, companyName: name, ownerName: billing.ownerName, ownerEmail: billing.ownerEmail,
        plan: billing.plan, status: billing.status, employeeLimit: billing.employeeLimit, amount: 0, billingCycle: billing.billingCycle,
        renewalAt: billing.renewalAt, createdAt: now, updatedAt: now
      }
    });
    const grants = await tx.tenantFeatureGrant.findMany({ where: { tenantId: input.billingTenantId } });
    for (const grant of grants) {
      await tx.tenantFeatureGrant.create({ data: { id: `grant-${randomUUID()}`, tenantId, viewKey: grant.viewKey, grantedBy: "workspace-project", createdAt: now } });
    }
    // A project is part of the account, not a separate client: keep it out of the platform team's client lists.
    await tx.adminHiddenClient.upsert({ where: { tenantId }, create: { tenantId, hiddenAt: now, hiddenBy: "workspace-project" }, update: {} });
  });
  await prisma.$executeRaw`INSERT INTO workspace_projects (id, group_id, tenant_id, name, color, position, archived, created_at) VALUES (${projectId}, ${group.groupId}, ${tenantId}, ${name}, ${color}, ${position}, 0, ${now})`;
  invalidateWorkspaceCache();
  return { id: projectId, groupId: group.groupId, tenantId, name, color, position, archived: false, createdAt: now, primary: false };
}

export async function updateProject(groupId: string, projectId: string, patch: { name?: unknown; color?: unknown; archived?: unknown }): Promise<ProjectRow> {
  await ensureWorkspacesSchema();
  const rows = await prisma.$queryRaw<RawProject[]>`SELECT * FROM workspace_projects WHERE id = ${projectId} AND group_id = ${groupId}`;
  const current = rows[0];
  if (!current) throw new WorkspaceInputError("المشروع غير موجود");
  const group = (await prisma.$queryRaw<Array<{ billing_tenant_id: string }>>`SELECT billing_tenant_id FROM workspace_groups WHERE id = ${groupId}`)[0];
  const name = patch.name === undefined ? current.name : cleanName(patch.name);
  if (name.length < 2) throw new WorkspaceInputError("اسم المشروع مطلوب (حرفان على الأقل)");
  const color = patch.color === undefined ? current.color : cleanColor(patch.color, current.color);
  const archived = patch.archived === undefined ? Number(current.archived) : patch.archived ? 1 : 0;
  // The original account cannot be archived: it holds the subscription.
  if (archived === 1 && group && current.tenant_id === group.billing_tenant_id) throw new WorkspaceInputError("لا يمكن أرشفة المشروع الأساسي للحساب");
  await prisma.$executeRaw`UPDATE workspace_projects SET name = ${name}, color = ${color}, archived = ${archived} WHERE id = ${projectId} AND group_id = ${groupId}`;
  invalidateWorkspaceCache();
  return toRow({ ...current, name, color, archived }, group?.billing_tenant_id ?? "");
}

/**
 * Keeps each project's copy of the plan in step with the account's subscription, so plan limits and access rules (which read the
 * project's own subscription row) always match what the account pays for. Called after the account's subscription changes.
 * Never touches the card, the price or the renewal charge of a project.
 */
export async function syncProjectSubscriptions(billingTenantId: string): Promise<void> {
  if (!workspacesConfigured()) return;
  const context = await getGroupContext(billingTenantId);
  if (!context || context.billingTenantId !== billingTenantId) return;
  const billing = await prisma.subscription.findUnique({ where: { tenantId: billingTenantId } });
  if (!billing) return;
  const now = new Date().toISOString();
  for (const project of context.projects) {
    if (project.tenantId === billingTenantId) continue;
    await prisma.subscription.updateMany({
      where: { tenantId: project.tenantId },
      data: {
        plan: billing.plan, status: billing.status, employeeLimit: billing.employeeLimit, billingCycle: billing.billingCycle,
        renewalAt: billing.renewalAt, cancelledAt: billing.cancelledAt, updatedAt: now,
        autoRenewEnabled: 0, savedCardToken: "", savedCardLast4: "", savedCardBrand: "", amount: 0
      }
    });
    invalidateShortCache(`sub:${project.tenantId}`);
  }
}

/** Tenant ids of every project that is not its account's billing tenant. Empty (and free) while the feature is not configured. */
export async function projectChildTenantIds(): Promise<Set<string>> {
  if (!workspacesConfigured()) return new Set();
  return cachedFor("ws:children", 30000, async () => {
    await ensureWorkspacesSchema();
    const rows = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT p.tenant_id AS tenant_id FROM workspace_projects p JOIN workspace_groups g ON g.id = p.group_id WHERE p.tenant_id <> g.billing_tenant_id`;
    return new Set(rows.map((row) => row.tenant_id));
  });
}

/** How many separate accounts a list of workspaces really is: the projects of one account count once. */
export async function distinctAccountCount(tenantIds: string[]): Promise<number> {
  const accounts = new Set<string>();
  for (const tenantId of tenantIds) accounts.add(await billingTenantFor(tenantId));
  return accounts.size;
}
