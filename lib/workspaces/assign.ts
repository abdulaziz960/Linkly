import { prisma } from "../prisma";
import { canAccessConversation } from "../permissions-server";
import { logAssignmentMessage } from "../conversation-system-messages";
import { logAdminAction, getTenantCompanyName } from "../subscriptions";
import { ensureWorkspacesSchema } from "./schema";
import type { WorkspaceViewer } from "./service";
import { getGroupContext, workspacesEnabledForTenant } from "./store";

export class AssignError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** The name an employee of ANOTHER project carries on the conversation, so it can never match someone of the same name in its own project. */
export const crossAssigneeName = (employeeName: string, projectName: string) => `${employeeName} (${projectName})`;

/**
 * The shared core: hands a conversation of `tenantId` to an employee of any ACTIVE project of the same account (or clears it with null).
 * Used by the inbox (a person chose it) and by automations / the auto-reply (a rule chose it); `assignedBy` is "" for the latter.
 * The account must have the feature on; the conversation must exist in `tenantId`.
 */
export async function assignConversationToProjectEmployee(input: { tenantId: string; conversationId: string; employeeId: string | null; assignedBy: string }) {
  await ensureWorkspacesSchema();
  const { tenantId, conversationId, assignedBy } = input;
  if (!(await workspacesEnabledForTenant(tenantId))) throw new AssignError("المشاريع غير مفعّلة لهذا الحساب", 404);
  const group = await getGroupContext(tenantId);
  if (!group) throw new AssignError("المشاريع غير مفعّلة لهذا الحساب", 404);
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { id: true, status: true, customer: { select: { name: true } } } });
  if (!conversation) throw new AssignError("المحادثة غير موجودة", 404);

  const clear = async () => { await prisma.$executeRaw`DELETE FROM workspace_assignments WHERE tenant_id = ${tenantId} AND conversation_id = ${conversationId}`; };

  if (!input.employeeId) {
    await clear();
    await prisma.conversation.updateMany({ where: { id: conversationId, tenantId }, data: { assignee: "بدون موظف", status: conversation.status === "closed" ? "closed" : "unassigned" } });
    return { assignee: "بدون موظف" };
  }

  const projects = group.projects.filter((project) => !project.archived);
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: { in: projects.map((project) => project.tenantId) } } });
  if (!employee) throw new AssignError("الموظف غير موجود في مشاريع هذا الحساب", 404);
  const project = projects.find((entry) => entry.tenantId === employee.tenantId)!;

  let assignee = employee.name;
  if (employee.tenantId === tenantId) {
    await clear();
  } else {
    // Needs a login to see the conversation from its own account.
    let userId = employee.userId;
    if (!userId) userId = (await prisma.userAccount.findUnique({ where: { email: employee.email.toLowerCase() }, select: { id: true } }))?.id ?? "";
    if (!userId) throw new AssignError("هذا الموظف لم يفعّل حسابه بعد", 409);
    assignee = crossAssigneeName(employee.name, project.name);
    const now = new Date().toISOString();
    await clear();
    await prisma.$executeRaw`INSERT INTO workspace_assignments (tenant_id, conversation_id, user_id, assignee_name, assigned_by, assigned_at) VALUES (${tenantId}, ${conversationId}, ${userId}, ${assignee}, ${assignedBy}, ${now})`;
  }

  await prisma.conversation.updateMany({ where: { id: conversationId, tenantId }, data: { assignee, status: conversation.status === "closed" ? "closed" : "assigned" } });
  await logAdminAction(tenantId, await getTenantCompanyName(tenantId), `تم إسناد محادثة "${conversation.customer.name}" إلى ${assignee}${assignedBy ? ` بواسطة ${assignedBy}` : " تلقائيًا"}.`, "معلومة", "المحادثات");
  await logAssignmentMessage({ conversationId, tenantId, assignee, assignedBy });
  return { assignee };
}

/** The target value an automation or the auto-reply stores for an employee of ANOTHER project: "ws:<employee id>". */
export const PROJECT_EMPLOYEE_PREFIX = "ws:";
export const isProjectEmployeeTarget = (value: string) => value.startsWith(PROJECT_EMPLOYEE_PREFIX) && value.length > PROJECT_EMPLOYEE_PREFIX.length;

/**
 * Hands a conversation of the viewer's current workspace to an employee of any project of the same account. The caller must be allowed
 * to touch the conversation (the normal rule: the owner, or the assignee / team lead).
 */
export async function assignAcrossProjects(viewer: WorkspaceViewer, conversationId: string, employeeId: string | null) {
  if (!(await canAccessConversation(viewer.user, conversationId))) throw new AssignError("المحادثة غير موجودة", 404);
  return assignConversationToProjectEmployee({ tenantId: viewer.user.tenantId, conversationId, employeeId, assignedBy: viewer.user.name });
}
