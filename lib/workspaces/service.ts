import { cookies } from "next/headers";
import { prisma } from "../prisma";
import { getCurrentUser } from "../auth";
import { getGroupContext, ensureGroupForBilling, workspacesEnabledForTenant, type GroupContext, type ProjectRow } from "./store";
import { workspacesConfigured } from "./feature";

export const SCOPE_COOKIE = "linkly_ws_scope";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type WorkspaceViewer = {
  user: SessionUser;
  group: GroupContext;
  /** The user owns the original account (the one holding the subscription): the only one who creates and manages projects. */
  ownsAccount: boolean;
  /** Active (not archived) projects where this user is a member, with their membership row. */
  memberships: Array<{ project: ProjectRow; employee: { id: string; name: string; role: string; email: string; permissions: string } }>;
};

/**
 * The single server-side gate of the feature. Returns null - and callers answer 404 - unless the account's plan is eligible AND its
 * id is on the allow list. Never relies on the UI, on a header, or on an email address.
 */
export async function loadWorkspaceViewer(user: SessionUser): Promise<WorkspaceViewer | null> {
  if (!workspacesConfigured()) return null;
  if (!(await workspacesEnabledForTenant(user.tenantId))) return null;

  let group = await getGroupContext(user.tenantId);
  if (!group) {
    // First use: only the owner of the original account starts it.
    const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId }, select: { companyName: true } });
    const isOwner = user.role === "مالك الحساب" && await prisma.employee.findFirst({ where: { tenantId: user.tenantId, OR: [{ userId: user.id }, { email: user.email }], role: "مالك الحساب" }, select: { id: true } });
    if (!isOwner) return null;
    group = await ensureGroupForBilling(user.tenantId, subscription?.companyName || "حساب الشركة");
  }

  const identity = [{ userId: user.id }, { email: user.email }];
  const employees = await prisma.employee.findMany({
    where: { tenantId: { in: group.projects.map((project) => project.tenantId) }, OR: identity },
    select: { id: true, name: true, role: true, email: true, permissions: true, tenantId: true, userId: true }
  });
  const memberships = group.projects
    .filter((project) => !project.archived)
    .flatMap((project) => {
      const employee = employees.find((row) => row.tenantId === project.tenantId && (row.userId === user.id || row.email.toLowerCase() === user.email.toLowerCase()));
      return employee ? [{ project, employee }] : [];
    });
  const ownsAccount = employees.some((row) => row.tenantId === group.billingTenantId && row.role === "مالك الحساب");
  if (!memberships.length) return null;
  return { user, group, ownsAccount, memberships };
}

/** The viewer of the current request, or null when the feature is off for this account (or nobody is signed in). */
export async function getWorkspaceViewer(): Promise<WorkspaceViewer | null> {
  if (!workspacesConfigured()) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return loadWorkspaceViewer(user);
}

/** What the project switcher shows as selected: "all", or the id of one project the user is a member of. */
export async function resolveScope(viewer: WorkspaceViewer): Promise<"all" | string> {
  const stored = (await cookies()).get(SCOPE_COOKIE)?.value ?? "";
  const activeProject = viewer.memberships.find((entry) => entry.project.tenantId === viewer.user.tenantId)?.project;
  if (stored === "all" && viewer.memberships.length > 1) return "all";
  const chosen = viewer.memberships.find((entry) => entry.project.id === stored)?.project;
  return chosen?.id ?? activeProject?.id ?? viewer.memberships[0].project.id;
}

export function projectOf(viewer: WorkspaceViewer, projectId: string) {
  return viewer.memberships.find((entry) => entry.project.id === projectId) ?? null;
}
