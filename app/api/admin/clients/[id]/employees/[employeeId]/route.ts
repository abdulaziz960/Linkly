import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../../lib/prisma";
import { isValidEmail } from "../../../../../../../lib/validation";
import { getSubscriptionForTenant, logAdminAction } from "../../../../../../../lib/subscriptions";
import { changeDetails, recordAdminAction } from "../../../../../../../lib/admin-audit";
import { jsonError, jsonOk } from "../../../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; employeeId: string }> };

/**
 * Lets Linkly staff fix a client's employee role/permissions directly, for
 * the (common) case where the tenant's own owner set a "مشرف" role without
 * also ticking the matching permission checkboxes - support previously had
 * no way to unblock this short of asking the client to edit it themselves,
 * since there's no "log in as client" capability. Mirrors the tenant-side
 * PATCH (app/api/employees/[id]/route.ts) but skips its owner-protection
 * and self-lockout guards, which don't apply to a trusted admin caller.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId, employeeId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    role?: string;
    permissions?: string;
  } | null;
  if (!body) return jsonError("طلب غير صالح");

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role?.trim();
  if (!name) return jsonError("اسم الموظف مطلوب");
  if (!email) return jsonError("البريد الإلكتروني مطلوب");
  if (!isValidEmail(email)) return jsonError("أدخل بريداً إلكترونياً صحيحاً");
  if (!role) return jsonError("الدور مطلوب");

  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);

  const existingEmployee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
  if (!existingEmployee) return jsonError("الموظف غير موجود", 404);

  if (email !== existingEmployee.email) {
    const emailTakenByEmployee = await prisma.employee.findFirst({
      where: { email, tenantId, NOT: { id: employeeId } }
    });
    if (emailTakenByEmployee) return jsonError("يوجد موظف آخر مسجل بهذا البريد الإلكتروني", 409);

    const emailTakenByAccount = await prisma.userAccount.findUnique({ where: { email } });
    if (emailTakenByAccount) return jsonError("هذا البريد الإلكتروني مستخدم بالفعل لحساب آخر على المنصة", 409);
  }

  try {
    const employee = await prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: { id: employeeId, tenantId },
        data: {
          name,
          email,
          role,
          permissions: body.permissions || existingEmployee.permissions,
          initial: name.slice(0, 1)
        }
      });

      // Same dual-write the tenant-side route does - UserAccount.role/name/
      // email are what auth/permissions actually read on next session
      // refresh (see app/api/employees/[id]/route.ts's comment).
      await tx.userAccount.updateMany({
        where: { email: existingEmployee.email, tenantId },
        data: { name, email, role }
      });

      return tx.employee.findFirstOrThrow({ where: { id: employeeId, tenantId } });
    });

    const fieldChanges = [
      name !== existingEmployee.name ? `الاسم إلى "${name}"` : null,
      email !== existingEmployee.email ? `البريد إلى "${email}"` : null,
      role !== existingEmployee.role ? `الدور إلى "${role}"` : null,
      body.permissions && body.permissions !== existingEmployee.permissions ? "الصلاحيات" : null
    ].filter((change): change is string => Boolean(change));
    if (fieldChanges.length) {
      await logAdminAction(
        tenantId,
        subscription.companyName,
        `تم تعديل بيانات الموظف "${employee.name}" (${fieldChanges.join("، ")}) بواسطة فريق الدعم (${admin.name}).`,
        "معلومة",
        "الموظفون"
      );
    }
    await recordAdminAction(admin, "edit-client-employee", { type: "employee", id: employeeId }, changeDetails({ name: existingEmployee.name, email: existingEmployee.email, role: existingEmployee.role, permissions: existingEmployee.permissions }, { name, email, role, permissions: body.permissions }, existingEmployee.name));

    return jsonOk(employee);
  } catch {
    return jsonError("تعذر تحديث الموظف", 404);
  }
}
