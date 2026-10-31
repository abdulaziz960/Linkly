import { prisma } from "../prisma";
import { getConversations } from "../database";
import { getVisibleAssigneeNames } from "../permissions-server";
import type { Conversation } from "../../app/dashboard/types";
import { ensureWorkspacesSchema } from "./schema";
import type { WorkspaceViewer } from "./service";

const stamp = (conversation: Conversation) => conversation.lastActivityAt || "";

/**
 * Conversations the viewer was handed from a project they are NOT a member of. Only those conversations, nothing else of that
 * project, and only while the hand-over row exists.
 */
export async function crossProjectConversations(viewer: WorkspaceViewer): Promise<Conversation[]> {
  await ensureWorkspacesSchema();
  const memberTenants = new Set(viewer.memberships.map((entry) => entry.project.tenantId));
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string; conversation_id: string; assignee_name: string }>>`SELECT tenant_id, conversation_id, assignee_name FROM workspace_assignments WHERE user_id = ${viewer.user.id}`;
  const projectByTenant = new Map(viewer.group.projects.map((project) => [project.tenantId, project]));
  const byTenant = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) {
    // A project outside this account never counts, and neither does one the user already belongs to (normal rules apply there).
    if (!projectByTenant.has(row.tenant_id) || memberTenants.has(row.tenant_id)) continue;
    byTenant.set(row.tenant_id, [...(byTenant.get(row.tenant_id) ?? []), { id: row.conversation_id, name: row.assignee_name }]);
  }
  const result: Conversation[] = [];
  for (const [tenantId, items] of byTenant) {
    const project = projectByTenant.get(tenantId)!;
    const ids = new Set(items.map((item) => item.id));
    const loaded = await getConversations(tenantId, [...new Set(items.map((item) => item.name))]);
    for (const conversation of loaded) {
      if (!ids.has(conversation.id)) continue;
      result.push({ ...conversation, projectId: project.id, projectName: project.name, projectColor: project.color, crossProject: true });
    }
  }
  return result;
}

/** Every conversation the viewer may see across the projects they belong to, each by that project's own visibility rules. */
export async function aggregatedConversations(viewer: WorkspaceViewer): Promise<Conversation[]> {
  const all: Conversation[] = [];
  for (const { project, employee } of viewer.memberships) {
    const visible = await getVisibleAssigneeNames({ role: employee.role, email: viewer.user.email, tenantId: project.tenantId }, employee);
    const conversations = await getConversations(project.tenantId, visible);
    for (const conversation of conversations) all.push({ ...conversation, projectId: project.id, projectName: project.name, projectColor: project.color });
  }
  all.push(...await crossProjectConversations(viewer));
  return all.sort((a, b) => stamp(b).localeCompare(stamp(a)));
}
