import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getDiscountCodes, createDiscountCode } from "../../../../lib/promo-codes";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getDiscountCodes());
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    code?: string;
    discountType?: "percentage" | "fixed";
    discountValue?: number;
    maxDiscountAmount?: number;
    minimumAmount?: number;
    applicablePlanIds?: string[];
    newUsersOnly?: boolean;
    firstSubscriptionOnly?: boolean;
    usageLimit?: number;
    usageLimitPerUser?: number;
    startsAt?: string;
    expiresAt?: string;
  };

  try {
    const discountCode = await createDiscountCode({
      name: body.name || "",
      code: body.code || "",
      discountType: body.discountType || "percentage",
      discountValue: Number(body.discountValue ?? 0),
      maxDiscountAmount: Number(body.maxDiscountAmount ?? 0),
      minimumAmount: Number(body.minimumAmount ?? 0),
      applicablePlanIds: body.applicablePlanIds || [],
      newUsersOnly: Boolean(body.newUsersOnly),
      firstSubscriptionOnly: body.firstSubscriptionOnly,
      usageLimit: body.usageLimit !== undefined ? Number(body.usageLimit) : -1,
      usageLimitPerUser: body.usageLimitPerUser !== undefined ? Number(body.usageLimitPerUser) : 1,
      startsAt: body.startsAt || "",
      expiresAt: body.expiresAt || "",
      createdBy: admin.name || admin.email
    });
    await recordAdminAction(admin, "create-discount-code", { type: "discount_code", id: discountCode.id }, JSON.stringify({ code: discountCode.code, discountType: discountCode.discountType, discountValue: discountCode.discountValue }));
    return jsonOk(discountCode);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إنشاء كود الخصم", 400);
  }
}
