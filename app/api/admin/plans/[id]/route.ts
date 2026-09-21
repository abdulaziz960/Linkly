import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { updatePlan } from "../../../../../lib/plans";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { sanitizeAllowedChannelsInput } from "../../../../../lib/channel-catalog";
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
    aiDailyLimit?: number;
    aiMonthlyLimit?: number;
    allowedChannels?: unknown;
    messageQuota?: number;
  };

  try {
    const plan = await updatePlan(id, {
      ...body,
      // Omitted entirely (e.g. an unrelated "active" toggle) must leave the
      // existing restriction untouched, not silently reset it to
      // unrestricted - only sanitize when the field was actually sent.
      allowedChannels: body.allowedChannels !== undefined ? sanitizeAllowedChannelsInput(body.allowedChannels) : undefined
    });
    await recordAdminAction(admin, "update-plan", { type: "plan", id }, JSON.stringify(body));
    return jsonOk(plan);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر تحديث الباقة", 400);
  }
}
