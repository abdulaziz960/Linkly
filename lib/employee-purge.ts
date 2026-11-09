import { prisma } from "./prisma";
import { REMOVED_STATUS } from "./employee-removal";

export type PurgeEmployeeResult = { ok: true; employeeName: string; accountDeleted: boolean } | { ok: false; error: string; status: number };

/**
 * Permanently deletes an employee who was already removed from a workspace (never one who is still active, and never the
 * owner). Messages, reports and activity keep the name they were written under (they store names, not links), so history
 * stays readable. The login account is deleted too, freeing the email, unless the same person still belongs to another
 * workspace - then only this workspace's membership row goes. There is no undo.
 */
export async function purgeRemovedEmployee(input: { tenantId: string; employeeId: string }): Promise<PurgeEmployeeResult> {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: input.tenantId } });
  if (!employee) return { ok: false, error: "الموظف غير موجود", status: 404 };
  if (employee.role === "مالك الحساب") return { ok: false, error: "لا يمكن حذف مالك الحساب", status: 403 };
  if (employee.status !== REMOVED_STATUS) return { ok: false, error: "لا يُحذف نهائيًا إلا موظف أُزيل من الفريق أولًا", status: 409 };

  const email = employee.email.toLowerCase();
  const otherMemberships = employee.userId
    ? await prisma.employee.count({ where: { userId: employee.userId, NOT: { tenantId: input.tenantId }, status: { not: REMOVED_STATUS } } })
    : 0;
  const account = await prisma.userAccount.findUnique({ where: { email }, select: { id: true } });

  let accountDeleted = false;
  await prisma.$transaction(async (tx) => {
    await tx.teamMember.deleteMany({ where: { employeeId: employee.id } });
    await tx.employee.delete({ where: { id: employee.id } });
    if (account && otherMemberships === 0) {
      await tx.pushSubscription.deleteMany({ where: { userId: account.id } });
      await tx.employeeInvite.deleteMany({ where: { email } });
      await tx.userAccount.delete({ where: { id: account.id } });
      accountDeleted = true;
    }
  });
  return { ok: true, employeeName: employee.name, accountDeleted };
}
