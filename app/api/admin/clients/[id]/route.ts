import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { updateSubscription } from "../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;
  const body = (await request.json()) as {
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

  try {
    const subscription = await updateSubscription(tenantId, body, admin.name);
    return jsonOk(subscription);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر تحديث الاشتراك", 404);
  }
}

// Permanently deleting a client account is disabled by policy: no one can
// wipe a tenant's data through the product. Set status to "متوقف" via
// PATCH instead - it blocks the tenant's access immediately while keeping
// every row (conversations, customers, billing history, ...) intact, and
// can be reversed at any time by setting status back to "نشط".
export async function DELETE() {
  return jsonError("حذف حسابات العملاء نهائيًا غير متاح. استخدم تعطيل الحساب بدلاً من ذلك.", 403);
}
