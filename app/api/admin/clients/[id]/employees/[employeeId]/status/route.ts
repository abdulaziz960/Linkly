import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../../../lib/prisma";
import { getSubscriptionForTenant, logAdminAction } from "../../../../../../../../lib/subscriptions";
import { recordAdminAction } from "../../../../../../../../lib/admin-audit";
import { jsonError, jsonOk } from "../../../../../../_utils/json";
import { isTrustedOrigin } from "../../../../../../../../lib/origin-guard";
import { invalidateUserCache } from "../../../../../../../../lib/tenant-subscription-row";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; employeeId: string }> };

/**
 * Lets Linkly staff disable or re-enable a client's employee. A client owner can do it from their own
 * team page, but when the owner disabled the wrong person (or is locked out) support had no way to undo it.
 * The lockout lives on the login account (account-wide, found by email), exactly as the tenant-side route does.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId, employeeId } = await context.params;
  const body = (await request.json().catch(() => null)) as { disabled?: unknown } | null;
  if (!body || typeof body.disabled !== "boolean") return jsonError("الحالة المطلوبة غير صالحة");
  const disabled = body.disabled;

  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
  if (!employee || employee.status === "مُزال") return jsonError("الموظف غير موجود", 404);

  const lockout = await prisma.userAccount.updateMany({
    where: { email: employee.email },
    data: {
      disabled: disabled ? 1 : 0,
      ...(disabled ? { sessionVersion: { increment: 1 } } : { failedLoginAttempts: 0, lockedAt: "" })
    }
  });
  if (lockout.count !== 1) return jsonError("تعذر العثور على حساب الدخول لهذا الموظف", 404);
  invalidateUserCache();

  await logAdminAction(
    tenantId,
    subscription.companyName,
    `${disabled ? "تم تعطيل" : "تم تفعيل"} حساب الموظف "${employee.name}" بواسطة فريق الدعم (${admin.name}).`,
    disabled ? "تنبيه" : "معلومة",
    "الموظفون"
  );
  await recordAdminAction(admin, disabled ? "disable-client-employee" : "enable-client-employee", { type: "employee", id: employeeId });
  return jsonOk({ id: employeeId, disabled });
}
