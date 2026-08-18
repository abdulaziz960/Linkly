import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getPlans, createPlan } from "../../../../lib/plans";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getPlans());
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    monthlyPrice?: number;
    employeeLimit?: number;
  };

  try {
    const plan = await createPlan({
      name: body.name || "",
      monthlyPrice: Number(body.monthlyPrice ?? 0),
      employeeLimit: Number(body.employeeLimit ?? 1)
    });
    return jsonOk(plan);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء الباقة", 400);
  }
}
