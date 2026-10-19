import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { createDiscount, listDiscounts, type DiscountInput } from "../../../../lib/catalog-discounts";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk(await listDiscounts(user.tenantId));
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as DiscountInput | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const result = await createDiscount(user.tenantId, body);
  if (!result.ok) return jsonError(result.error, 400);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تمت إضافة كود الخصم "${result.discount.code}" بواسطة ${user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(result.discount);
}
