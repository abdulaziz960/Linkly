import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { updatePlan } from "../../../../../lib/plans";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    monthlyPrice?: number;
    employeeLimit?: number;
    active?: boolean;
  };

  try {
    const plan = await updatePlan(id, body);
    return jsonOk(plan);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر تحديث الباقة", 400);
  }
}
