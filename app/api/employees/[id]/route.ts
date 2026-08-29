import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isOwnerEquivalentGrant } from "../../../../lib/permissions";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "employees"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    email?: string;
    role?: string;
    status?: string;
    permissions?: string;
  };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role || "موظف دعم";

  if (!name) return jsonError("اسم الموظف مطلوب");
  if (!email) return jsonError("البريد الإلكتروني مطلوب");
  if (isOwnerEquivalentGrant(body.role || "", body.permissions || "") && user.role !== "مالك الحساب") {
    return jsonError("فقط مالك الحساب يقدر يمنح صلاحية بمستوى المالك", 403);
  }

  try {
    const existingEmployee = await prisma.employee.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existingEmployee) {
      return jsonError("تعذر تحديث الموظف", 404);
    }
    // Only the account owner may modify the owner's own record - otherwise
    // any employee with employees-management access could demote or
    // reassign the owner.
    if (existingEmployee.role === "مالك الحساب" && user.role !== "مالك الحساب") {
      return jsonError("لا يمكن تعديل حساب مالك الحساب", 403);
    }

    if (email !== existingEmployee.email) {
      const emailTakenByEmployee = await prisma.employee.findFirst({
        where: { email, tenantId: user.tenantId, NOT: { id } }
      });
      if (emailTakenByEmployee) return jsonError("يوجد موظف آخر مسجل بهذا البريد الإلكتروني", 409);

      const emailTakenByAccount = await prisma.userAccount.findUnique({ where: { email } });
      if (emailTakenByAccount) {
        return jsonError("هذا البريد الإلكتروني مستخدم بالفعل لحساب آخر على المنصة", 409);
      }
    }

    const employee = await prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: { id, tenantId: user.tenantId },
        data: {
          name,
          email,
          role,
          status: body.status || "متصل",
          permissions: body.permissions || "محادثات فقط",
          initial: name.slice(0, 1)
        }
      });

      // Keep the linked login account (matched by the employee's previous
      // email) in sync so role/name/email changes actually take effect on
      // the next session refresh instead of silently drifting apart.
      await tx.userAccount.updateMany({
        where: { email: existingEmployee.email, tenantId: user.tenantId },
        data: { name, email, role }
      });

      return tx.employee.findFirstOrThrow({ where: { id, tenantId: user.tenantId } });
    });

    return jsonOk(employee);
  } catch {
    return jsonError("تعذر تحديث الموظف", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "employees"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;

  try {
    const employee = await prisma.employee.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!employee) return jsonError("تعذر حذف الموظف", 404);
    // Only the account owner may delete the owner's own record - otherwise
    // any employee with employees-management access could remove the owner
    // (and, via the linked-account cleanup below, their login) outright.
    if (employee.role === "مالك الحساب" && user.role !== "مالك الحساب") {
      return jsonError("لا يمكن حذف حساب مالك الحساب", 403);
    }

    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { employeeId: id, team: { tenantId: user.tenantId } } }),
      prisma.employeeInvite.deleteMany({ where: { email: employee.email } }),
      // Scoped by tenantId too, not just email: email is globally unique on
      // UserAccount today, but this keeps the delete tenant-safe even if
      // that ever changes or a stale/duplicate row exists.
      prisma.userAccount.deleteMany({ where: { email: employee.email, tenantId: user.tenantId } }),
      prisma.employee.deleteMany({ where: { id, tenantId: user.tenantId } })
    ]);

    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الموظف", 404);
  }
}
