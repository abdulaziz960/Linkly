import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { deleteShippingMethod, getShippingMethod, updateShippingMethod, type ShippingInput } from "../../../../../lib/catalog-shipping";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { logAdminAction, getTenantCompanyName } from "../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Edits a delivery option, or only switches it on/off (`{ active }`). */
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as ShippingInput | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const result = await updateShippingMethod(user.tenantId, id, body);
  if (!result.ok) return jsonError(result.error, result.error.includes("غير موجودة") ? 404 : 400);
  return jsonOk(result.method);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await params;
  const existing = await getShippingMethod(user.tenantId, id);
  if (!existing || !(await deleteShippingMethod(user.tenantId, id))) return jsonError("طريقة الشحن غير موجودة", 404);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم حذف طريقة الشحن "${existing.name}" بواسطة ${user.name}.`, "معلومة", "الكتالوج");
  return jsonOk({ deleted: true });
}
