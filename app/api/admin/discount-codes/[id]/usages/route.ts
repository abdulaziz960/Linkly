import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { getDiscountCodeById, getDiscountCodeUsageStats } from "../../../../../../lib/promo-codes";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;

  const discountCode = await getDiscountCodeById(id);
  if (!discountCode) return jsonError("كود الخصم غير موجود", 404);

  const stats = await getDiscountCodeUsageStats(id);
  return jsonOk({ discountCode, ...stats });
}
