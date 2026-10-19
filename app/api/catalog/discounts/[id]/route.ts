import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { deleteDiscount, getDiscount, setDiscountActive } from "../../../../../lib/catalog-discounts";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { logAdminAction, getTenantCompanyName } from "../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Turns a code on or off: `{ active: boolean }`. */
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { active?: unknown } | null;
  if (typeof body?.active !== "boolean") return jsonError("طلب غير صالح", 400);
  if (!(await setDiscountActive(user.tenantId, id, body.active))) return jsonError("الكود غير موجود", 404);
  return jsonOk(await getDiscount(user.tenantId, id));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await params;
  const existing = await getDiscount(user.tenantId, id);
  if (!existing || !(await deleteDiscount(user.tenantId, id))) return jsonError("الكود غير موجود", 404);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم حذف كود الخصم "${existing.code}" بواسطة ${user.name}.`, "معلومة", "الكتالوج");
  return jsonOk({ deleted: true });
}
