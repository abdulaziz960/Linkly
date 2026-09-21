import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getPlans, createPlan } from "../../../../lib/plans";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { sanitizeAllowedChannelsInput } from "../../../../lib/channel-catalog";
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
    aiDailyLimit?: number;
    aiMonthlyLimit?: number;
    allowedChannels?: unknown;
  };

  try {
    const plan = await createPlan({
      name: body.name || "",
      monthlyPrice: Number(body.monthlyPrice ?? 0),
      employeeLimit: Number(body.employeeLimit ?? 1),
      aiDailyLimit: Number(body.aiDailyLimit ?? 0),
      aiMonthlyLimit: Number(body.aiMonthlyLimit ?? 0),
      allowedChannels: sanitizeAllowedChannelsInput(body.allowedChannels)
    });
    await recordAdminAction(admin, "create-plan", { type: "plan", id: plan.id }, JSON.stringify({ name: body.name, monthlyPrice: body.monthlyPrice }));
    return jsonOk(plan);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء الباقة", 400);
  }
}
