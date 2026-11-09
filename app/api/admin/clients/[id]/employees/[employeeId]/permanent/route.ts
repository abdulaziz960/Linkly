import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../../../lib/admin-auth";
import { getSubscriptionForTenant, logAdminAction } from "../../../../../../../../lib/subscriptions";
import { recordAdminAction } from "../../../../../../../../lib/admin-audit";
import { purgeRemovedEmployee } from "../../../../../../../../lib/employee-purge";
import { jsonError, jsonOk } from "../../../../../../_utils/json";
import { isTrustedOrigin } from "../../../../../../../../lib/origin-guard";
import { invalidateUserCache } from "../../../../../../../../lib/tenant-subscription-row";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; employeeId: string }> };

/** Permanently deletes an employee the client already removed. Admin-only; there is no undo (see lib/employee-purge.ts). */
export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId, employeeId } = await context.params;
  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);

  const result = await purgeRemovedEmployee({ tenantId, employeeId });
  if (!result.ok) return jsonError(result.error, result.status);

  invalidateUserCache();
  await logAdminAction(
    tenantId,
    subscription.companyName,
    `حُذف الموظف المُزال "${result.employeeName}" نهائيًا بواسطة فريق الدعم (${admin.name})${result.accountDeleted ? " مع حساب دخوله" : ""}.`,
    "تنبيه",
    "الموظفون"
  );
  await recordAdminAction(admin, "purge-client-employee", { type: "employee", id: employeeId });
  return jsonOk({ deleted: true, accountDeleted: result.accountDeleted });
}
