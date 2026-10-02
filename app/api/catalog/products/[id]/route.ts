import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { cleanProductInput, deleteProduct, setProductActive, updateProduct, type ProductInput } from "../../../../../lib/catalog";
import { logAdminAction, getTenantCompanyName } from "../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as (ProductInput & { onlyActive?: boolean }) | null;
  if (!body) return jsonError("طلب غير صالح", 400);

  // Quick show/hide toggle from the list, without re-sending every field.
  if (body.onlyActive === true) {
    if (typeof body.active !== "boolean") return jsonError("قيمة غير صالحة", 400);
    const ok = await setProductActive(user.tenantId, id, body.active);
    return ok ? jsonOk({ id, active: body.active }) : jsonError("المنتج غير موجود", 404);
  }

  const cleaned = cleanProductInput(body);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);
  const product = await updateProduct(user.tenantId, id, cleaned.data);
  if (!product) return jsonError("المنتج غير موجود", 404);
  return jsonOk(product);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const removed = await deleteProduct(user.tenantId, id);
  if (!removed) return jsonError("المنتج غير موجود", 404);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم حذف منتج من الكتالوج بواسطة ${user.name}.`, "تنبيه", "الكتالوج");
  return jsonOk({ id });
}
