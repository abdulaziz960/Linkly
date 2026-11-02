import { prisma } from "./prisma";

/** The status of an employee who was removed from a workspace: hidden everywhere, no longer counted against the seat limit, history kept. */
export const REMOVED_STATUS = "مُزال";

export type RemoveEmployeeResult =
  | { ok: true; reassigned: number; employeeName: string }
  | { ok: false; error: string; status: number; openConversations?: number };

/**
 * Removes an employee from a workspace without deleting anything: their messages, activity and report history stay.
 * Their open conversations move to `reassignToId` (required when there are any). The login is locked, unless the same
 * person is also a member of another workspace - then only this workspace is left behind and their account stays usable there.
 */
export async function removeEmployee(input: { tenantId: string; employeeId: string; reassignToId: string; actorEmail: string }): Promise<RemoveEmployeeResult> {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: input.tenantId } });
  if (!employee || employee.status === REMOVED_STATUS) return { ok: false, error: "الموظف غير موجود", status: 404 };
  if (employee.role === "مالك الحساب") return { ok: false, error: "لا يمكن إزالة مالك الحساب", status: 403 };
  if (employee.email.toLowerCase() === input.actorEmail.toLowerCase()) return { ok: false, error: "لا يمكنك إزالة حسابك الخاص", status: 403 };

  const ledTeams = await prisma.team.findMany({ where: { tenantId: input.tenantId, lead: employee.name }, select: { name: true } });
  if (ledTeams.length) return { ok: false, error: `الموظف قائد فريق «${ledTeams[0].name}». غيّر قائد الفريق أولًا.`, status: 409 };

  const open = await prisma.conversation.count({ where: { tenantId: input.tenantId, assignee: employee.name, status: { not: "closed" } } });
  let target: { id: string; name: string; email: string } | null = null;
  if (input.reassignToId) {
    target = await prisma.employee.findFirst({ where: { id: input.reassignToId, tenantId: input.tenantId, NOT: { status: REMOVED_STATUS } }, select: { id: true, name: true, email: true } });
    if (!target || target.id === employee.id) return { ok: false, error: "اختر موظفًا آخر لنقل المحادثات إليه", status: 400 };
    const targetAccount = await prisma.userAccount.findUnique({ where: { email: target.email.toLowerCase() }, select: { disabled: true } });
    if (targetAccount?.disabled) return { ok: false, error: "الموظف المختار معطَّل. اختر موظفًا فعّالًا.", status: 400 };
  }
  if (open > 0 && !target) return { ok: false, error: "اختر الموظف الذي تُنقل إليه محادثاته المفتوحة", status: 400, openConversations: open };

  const otherMemberships = employee.userId
    ? await prisma.employee.findMany({ where: { userId: employee.userId, NOT: { tenantId: input.tenantId }, status: { not: REMOVED_STATUS } }, select: { tenantId: true, role: true } })
    : [];

  await prisma.$transaction(async (tx) => {
    if (target && open > 0) {
      await tx.conversation.updateMany({
        where: { tenantId: input.tenantId, assignee: employee.name, status: { not: "closed" } },
        data: { assignee: target.name, status: "assigned" }
      });
    }
    await tx.teamMember.deleteMany({ where: { employeeId: employee.id } });
    await tx.employee.update({ where: { id: employee.id }, data: { status: REMOVED_STATUS } });

    const email = employee.email.toLowerCase();
    if (otherMemberships.length) {
      // Still a member elsewhere: leave this workspace only, and end the sessions that are inside it.
      const account = await tx.userAccount.findUnique({ where: { email }, select: { tenantId: true } });
      await tx.userAccount.updateMany({
        where: { email },
        data: {
          sessionVersion: { increment: 1 },
          ...(account?.tenantId === input.tenantId ? { tenantId: otherMemberships[0].tenantId, role: otherMemberships[0].role } : {})
        }
      });
    } else {
      await tx.userAccount.updateMany({ where: { email }, data: { disabled: 1, sessionVersion: { increment: 1 } } });
    }
  });
  return { ok: true, reassigned: target ? open : 0, employeeName: employee.name };
}
