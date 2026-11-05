import { prisma } from "./prisma";
import { logAssignmentMessage } from "./conversation-system-messages";

/**
 * Assigning a lead to an employee from an external CRM.
 *
 * The CRM calls POST /api/v1/conversations with the employee it assigned the lead to. We find the
 * same person in Linkly - by email, by the CRM's own employee id (a mapping the owner keeps), or by
 * exact name - and assign the WhatsApp conversation to them, so the welcome message and every later
 * reply from the customer land on that employee. No match never loses the lead: it stays unassigned.
 */

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_employee_map (
      tenant_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, external_id)
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type CrmEmployeeRef = { email?: string; externalId?: string; name?: string };
type EmployeeLite = { id: string; name: string; email: string };

/** How the employee was found, or why not. */
export type CrmEmployeeMatch = { employee: EmployeeLite; by: "externalId" | "email" | "name" } | { employee: null; reason: "not_found" | "ambiguous_name" | "no_reference" };

export async function resolveCrmEmployee(tenantId: string, ref: CrmEmployeeRef): Promise<CrmEmployeeMatch> {
  const externalId = ref.externalId?.trim().slice(0, 100) ?? "";
  const email = ref.email?.trim().toLowerCase() ?? "";
  const name = ref.name?.trim() ?? "";
  if (!externalId && !email && !name) return { employee: null, reason: "no_reference" };

  if (externalId) {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ employee_id: string }>>`SELECT employee_id FROM crm_employee_map WHERE tenant_id = ${tenantId} AND external_id = ${externalId} LIMIT 1`;
    if (rows[0]) {
      const employee = await prisma.employee.findFirst({ where: { id: rows[0].employee_id, tenantId }, select: { id: true, name: true, email: true } });
      if (employee) return { employee, by: "externalId" };
    }
  }
  if (email) {
    const employees = await prisma.employee.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } });
    const byEmail = employees.find((employee) => employee.email.trim().toLowerCase() === email);
    if (byEmail) return { employee: byEmail, by: "email" };
  }
  if (name) {
    const employees = await prisma.employee.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } });
    const same = employees.filter((employee) => employee.name.trim().toLowerCase() === name.toLowerCase());
    if (same.length === 1) return { employee: same[0], by: "name" };
    if (same.length > 1) return { employee: null, reason: "ambiguous_name" };
  }
  return { employee: null, reason: "not_found" };
}

export type CrmAssignResult = { assigned: true; employee: string; by: string } | { assigned: false; reason: string; employee?: string };

/**
 * Assigns the conversation to the matching employee. An already-assigned conversation keeps its
 * employee unless `reassign` is set (a CRM resend must not steal a lead someone is already working).
 */
export async function assignConversationFromCrm(input: { tenantId: string; conversationId: string; ref: CrmEmployeeRef; reassign?: boolean }): Promise<CrmAssignResult> {
  const match = await resolveCrmEmployee(input.tenantId, input.ref);
  if (!match.employee) return { assigned: false, reason: match.reason };

  const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, tenantId: input.tenantId }, select: { assignee: true, status: true } });
  if (!conversation) return { assigned: false, reason: "conversation_not_found" };
  const alreadyAssigned = Boolean(conversation.assignee) && conversation.assignee !== "بدون موظف" && conversation.status === "assigned";
  if (alreadyAssigned && conversation.assignee !== match.employee.name && !input.reassign) {
    return { assigned: false, reason: "already_assigned", employee: conversation.assignee };
  }
  if (conversation.assignee === match.employee.name && conversation.status === "assigned") return { assigned: true, employee: match.employee.name, by: match.by };

  await prisma.conversation.updateMany({
    where: { id: input.conversationId, tenantId: input.tenantId },
    data: { assignee: match.employee.name, status: "assigned", botWaitingNodeId: "" }
  });
  await logAssignmentMessage({ conversationId: input.conversationId, tenantId: input.tenantId, assignee: match.employee.name, assignedBy: "نظام CRM" });
  return { assigned: true, employee: match.employee.name, by: match.by };
}

export async function listCrmEmployeeMap(tenantId: string) {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ external_id: string; employee_id: string }>>`SELECT external_id, employee_id FROM crm_employee_map WHERE tenant_id = ${tenantId} ORDER BY external_id ASC`;
  return rows.map((row) => ({ externalId: row.external_id, employeeId: row.employee_id }));
}

export async function setCrmEmployeeMapping(tenantId: string, externalIdRaw: unknown, employeeIdRaw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const externalId = typeof externalIdRaw === "string" ? externalIdRaw.trim() : "";
  const employeeId = typeof employeeIdRaw === "string" ? employeeIdRaw.trim() : "";
  if (!/^[\p{L}\p{N}_.@:-]{1,100}$/u.test(externalId)) return { ok: false, error: "معرّف الموظف في الـCRM غير صالح" };
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { id: true } });
  if (!employee) return { ok: false, error: "الموظف غير موجود" };
  await ensureTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`DELETE FROM crm_employee_map WHERE tenant_id = ${tenantId} AND external_id = ${externalId}`;
  await prisma.$executeRaw`INSERT INTO crm_employee_map (tenant_id, external_id, employee_id, updated_at) VALUES (${tenantId}, ${externalId}, ${employee.id}, ${now})`;
  return { ok: true };
}

export async function removeCrmEmployeeMapping(tenantId: string, externalIdRaw: unknown): Promise<boolean> {
  const externalId = typeof externalIdRaw === "string" ? externalIdRaw.trim() : "";
  if (!externalId) return false;
  await ensureTable();
  const removed = await prisma.$executeRaw`DELETE FROM crm_employee_map WHERE tenant_id = ${tenantId} AND external_id = ${externalId}`;
  return Number(removed) > 0;
}
