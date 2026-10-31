import { prisma } from "../prisma";
import { resolveScope, type WorkspaceViewer } from "./service";
import type { WorkspaceState } from "./types";
import { projectQuota } from "./feature";
import { getWorkspaceAddon } from "./addon-store";

export type { WorkspaceState, WorkspaceStateProject } from "./types";

/** What the dashboard needs to draw the project switcher. Owners see every project; everyone else only the projects they belong to. */
export async function buildWorkspaceState(viewer: WorkspaceViewer): Promise<WorkspaceState> {
  const scope = await resolveScope(viewer);
  const memberIds = new Set(viewer.memberships.map((entry) => entry.project.id));
  const visible = viewer.group.projects.filter((project) => (viewer.ownsAccount ? true : memberIds.has(project.id)));

  // Unread counts only for projects the viewer may see in full (the account owner); an employee never learns the size of a project's inbox.
  const unread = new Map<string, number>();
  if (viewer.ownsAccount) {
    const rows = await prisma.$queryRaw<Array<{ tenant_id: string; total: number | bigint | null }>>`SELECT tenant_id, SUM(unread) AS total FROM conversations WHERE unread > 0 GROUP BY tenant_id`;
    const tenantToProject = new Map(viewer.group.projects.map((project) => [project.tenantId, project.id]));
    for (const row of rows) {
      const projectId = tenantToProject.get(row.tenant_id);
      if (projectId) unread.set(projectId, Number(row.total ?? 0));
    }
  }

  const active = viewer.memberships.find((entry) => entry.project.tenantId === viewer.user.tenantId);
  const billing = await prisma.subscription.findUnique({ where: { tenantId: viewer.group.billingTenantId }, select: { plan: true } });
  const quota = projectQuota(billing?.plan ?? "", (await getWorkspaceAddon(viewer.group.billingTenantId)).extraProjects);
  return {
    enabled: true,
    accountName: viewer.group.name,
    ownsAccount: viewer.ownsAccount,
    scope,
    activeProjectId: active?.project.id ?? viewer.memberships[0].project.id,
    canViewAll: viewer.memberships.length > 1,
    quota: { used: viewer.group.projects.filter((project) => !project.archived).length, max: quota.maxProjects },
    projects: visible.map((project) => ({ id: project.id, name: project.name, color: project.color, primary: project.primary, archived: project.archived, member: memberIds.has(project.id), unread: unread.get(project.id) ?? 0 }))
  };
}
