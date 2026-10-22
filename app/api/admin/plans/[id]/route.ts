import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { getPlans, updatePlan } from "../../../../../lib/plans";
import { setShopifyPlanPrice } from "../../../../../lib/shopify-billing";
import { changeDetails, recordAdminAction } from "../../../../../lib/admin-audit";
import { sanitizeAllowedChannelsInput } from "../../../../../lib/channel-catalog";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("billing");
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
    featureItemsAr?: string;
    featureItemsEn?: string;
    emailQuota?: number;
    shopifyMonthlyUsd?: number;
  };

  try {
    const previous = (await getPlans()).find((plan) => plan.id === id);
    const { shopifyMonthlyUsd, ...planFields } = body;
    if (shopifyMonthlyUsd !== undefined) {
      if (!Number.isFinite(Number(shopifyMonthlyUsd)) || Number(shopifyMonthlyUsd) < 0) return jsonError("سعر شوبيفاي غير صالح", 400);
      await setShopifyPlanPrice(id, Number(shopifyMonthlyUsd));
    }
    const plan = await updatePlan(id, {
      ...planFields,
      // Omitted entirely (e.g. an unrelated "active" toggle) must leave the
      // existing restriction untouched, not silently reset it to
      // unrestricted - only sanitize when the field was actually sent.
      allowedChannels: body.allowedChannels !== undefined ? sanitizeAllowedChannelsInput(body.allowedChannels) : undefined
    });
    await recordAdminAction(admin, "update-plan", { type: "plan", id }, changeDetails({ ...(previous ?? {}) }, body, previous?.name));
    return jsonOk(plan);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر تحديث الباقة", 400);
  }
}
