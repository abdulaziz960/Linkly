import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isOwnerEquivalentGrant } from "../../../../lib/permissions";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";
import { isValidEmail } from "../../../../lib/validation";

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
    disabled?: boolean;
  };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role || "موظف دعم";

  if (!name) return jsonError("اسم الموظف مطلوب");
  if (!email) return jsonError("البريد الإلكتروني مطلوب");
  if (!isValidEmail(email)) return jsonError("أدخل بريداً إلكترونياً صحيحاً");
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
    // Disabling your own account would lock you out with no one left to
    // undo it, so block that specific combination even for the owner.
    if (body.disabled && existingEmployee.email.toLowerCase() === user.email.toLowerCase()) {
      return jsonError("لا يمكنك تعطيل حسابك الخاص", 403);
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
        data: {
          name,
          email,
          role,
          ...(body.disabled !== undefined ? { disabled: body.disabled ? 1 : 0 } : {}),
          // Disabling kills any session already open on this account right
          // now, instead of waiting for it to expire or be refreshed.
          ...(body.disabled ? { sessionVersion: { increment: 1 } } : {})
        }
      });

      return tx.employee.findFirstOrThrow({ where: { id, tenantId: user.tenantId } });
    });

    return jsonOk(employee);
  } catch {
    return jsonError("تعذر تحديث الموظف", 404);
  }
}

// Permanently deleting an employee account is disabled by policy: no one
// can wipe an employee's record, activity, or login through the product.
// Use PATCH { disabled: true/false } instead - it blocks their login
// immediately while keeping every row intact, and is fully reversible.
export async function DELETE() {
  return jsonError("حذف حسابات الموظفين نهائيًا غير متاح. استخدم تعطيل الحساب بدلاً من ذلك.", 403);
}
