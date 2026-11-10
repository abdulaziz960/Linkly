import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { getSubscriptionForTenant, logAdminAction, updateSubscription } from "../../../../../lib/subscriptions";
import { clientDeletionBlocker, deleteClientCompletely } from "../../../../../lib/client-deletion";
import { changeDetails, recordAdminAction } from "../../../../../lib/admin-audit";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { isValidRenewalAt } from "../../../../../lib/subscription-access";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const body = (await request.json()) as {
    companyName?: string;
    employeeLimit?: number;
    plan?: string;
    status?: string;
    amount?: number;
    billingCycle?: string;
    renewalAt?: string;
  };

  if (body.employeeLimit !== undefined && (!Number.isFinite(body.employeeLimit) || body.employeeLimit < 1)) {
    return jsonError("حد المستخدمين غير صحيح");
  }

  // A blank or unreadable date would leave the account with no end date at all.
  if (body.renewalAt !== undefined && !isValidRenewalAt(body.renewalAt)) {
    return jsonError("تاريخ التجديد غير صالح. أدخل تاريخاً صحيحاً.", 400);
  }

  try {
    const previous = await getSubscriptionForTenant(tenantId);
    const subscription = await updateSubscription(tenantId, body, admin.name);
    await recordAdminAction(admin, "update-client-subscription", { type: "tenant", id: tenantId }, changeDetails(previous ?? {}, body, previous?.companyName));
    return jsonOk(subscription);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر تحديث الاشتراك", 404);
  }
}

// Permanently deletes a client and all of its data (platform staff with the "clients" permission only). The company
// name must be retyped exactly, and only an account that never paid can be deleted - a paying client's billing
// history stays, so those are suspended instead. There is no undo.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const { confirmCompanyName } = (await request.json().catch(() => ({}))) as { confirmCompanyName?: string };
  const subscription = await getSubscriptionForTenant(tenantId);
  if (!subscription) return jsonError("العميل غير موجود", 404);
  if (tenantId === admin.tenantId) return jsonError("لا يمكن حذف مساحة الحساب الذي تعمل منه الآن", 400);
  if (!confirmCompanyName || confirmCompanyName.trim() !== subscription.companyName) return jsonError("اسم الشركة المكتوب لا يطابق اسم العميل المسجل", 400);
  const blocker = await clientDeletionBlocker(tenantId);
  if (blocker) return jsonError(blocker, 409);

  try {
    const { companyName } = await deleteClientCompletely(tenantId);
    // Logged outside the deleted tenant, so the trail survives the deletion.
    await logAdminAction("system", "النظام", `تم حذف العميل "${companyName}" (${tenantId}) نهائيًا بواسطة فريق الدعم (${admin.name}).`, "تنبيه");
    await recordAdminAction(admin, "delete-client", { type: "tenant", id: tenantId }, `حذف نهائي للعميل ${companyName}`);
    return jsonOk({ id: tenantId });
  } catch (error) {
    console.error("Client deletion failed", { tenantId, error });
    return jsonError("تعذر حذف العميل", 500);
  }
}
