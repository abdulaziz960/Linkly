import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { deleteTenant, updateSubscription } from "../../../../../lib/subscriptions";
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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id: tenantId } = await params;

  try {
    const result = await deleteTenant(tenantId);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر حذف العميل", 404);
  }
}
