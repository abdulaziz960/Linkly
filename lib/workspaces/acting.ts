import { prisma } from "../prisma";
import { workspacesConfigured } from "./feature";
import { ensureWorkspacesSchema } from "./schema";
import { getGroupContext, workspacesEnabledForTenant } from "./store";

type ActingUser = { id: string; tenantId: string; role: string; name: string; email: string };

/**
 * An employee of one project who was handed a conversation of ANOTHER project of the same account works that conversation as if it were
 * in their own inbox: this returns the user "acting in that conversation's workspace", limited to the one conversation (the permission
 * helpers match it by the hand-over name carried in `crossAssigneeName`). In every other case the user is returned unchanged.
 *
 * The hand-over must exist in workspace_assignments for this very user and conversation, both projects must belong to one account
 * that has the feature on - nothing the request contains can widen it.
 */
export async function actingUserForConversation<T extends ActingUser>(user: T, conversationId: string): Promise<T & { crossAssigneeName?: string }> {
  if (!workspacesConfigured() || !conversationId) return user;
  const own = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId: user.tenantId }, select: { id: true } });
  if (own) return user;
  await ensureWorkspacesSchema();
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string; assignee_name: string }>>`SELECT tenant_id, assignee_name FROM workspace_assignments WHERE conversation_id = ${conversationId} AND user_id = ${user.id}`;
  const row = rows[0];
  if (!row) return user;
  const group = await getGroupContext(user.tenantId);
  if (!group || !group.projects.some((project) => project.tenantId === row.tenant_id && !project.archived)) return user;
  if (!(await workspacesEnabledForTenant(user.tenantId))) return user;
  return { ...user, tenantId: row.tenant_id, role: "موظف", crossAssigneeName: row.assignee_name };
}

/** Removes a hand-over (the conversation was reassigned inside its own project, or closed for good). */
export async function clearCrossAssignment(tenantId: string, conversationId: string): Promise<void> {
  if (!workspacesConfigured()) return;
  await ensureWorkspacesSchema();
  await prisma.$executeRaw`DELETE FROM workspace_assignments WHERE tenant_id = ${tenantId} AND conversation_id = ${conversationId}`;
}
