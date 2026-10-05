import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { getDiscountCodeById, updateDiscountCode } from "../../../../../lib/promo-codes";
import { changeDetails, recordAdminAction } from "../../../../../lib/admin-audit";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
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
    active?: boolean;
  };

  try {
    const previous = await getDiscountCodeById(id);
    const discountCode = await updateDiscountCode(id, body);
    await recordAdminAction(admin, "update-discount-code", { type: "discount_code", id }, changeDetails(previous ?? {}, body, previous?.code));
    return jsonOk(discountCode);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر تحديث كود الخصم", 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;

  const discountCode = await getDiscountCodeById(id);
  if (!discountCode) return jsonError("كود الخصم غير موجود", 404);

  const usageCount = await prisma.discountCodeUsage.count({ where: { discountCodeId: id } });
  if (usageCount > 0) {
    return jsonError("لا يمكن حذف كود استُخدم من قبل - عطّله بدلاً من ذلك", 400);
  }

  await prisma.discountCode.delete({ where: { id } });
  await recordAdminAction(admin, "delete-discount-code", { type: "discount_code", id }, JSON.stringify({ code: discountCode.code }));
  return jsonOk({ deleted: true });
}
