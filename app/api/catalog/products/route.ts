import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { cleanProductInput, createProduct, deleteAllProducts, deleteProducts, listProductsForDashboard, type ProductInput } from "../../../../lib/catalog";
import { getProductNamesEn, setProductNameEn } from "../../../../lib/catalog-product-names";
import { PlanLimitError } from "../../../../lib/plan-access-server";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const products = await listProductsForDashboard(user.tenantId);
  const names = await getProductNamesEn(user.tenantId, products.map((product) => product.id));
  return jsonOk(products.map((product) => ({ ...product, nameEn: names.get(product.id) ?? "" })));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as (ProductInput & { nameEn?: unknown }) | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const cleaned = cleanProductInput(body);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  let product;
  try {
    product = await createProduct(user.tenantId, { ...cleaned.data, externalId: "" }, "manual");
  } catch (error) {
    if (error instanceof PlanLimitError) return jsonError(error.message, 403);
    throw error;
  }
  await setProductNameEn(user.tenantId, product.id, body.nameEn);
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تمت إضافة المنتج "${product.name}" بواسطة ${user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(product);
}

/** Bulk delete: `{ ids: [...] }` for a selection, or `{ all: true }` for the whole catalog. */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { ids?: unknown; all?: unknown } | null;
  let deleted = 0;
  if (body?.all === true) {
    deleted = await deleteAllProducts(user.tenantId);
  } else if (Array.isArray(body?.ids) && body.ids.length) {
    deleted = await deleteProducts(user.tenantId, body.ids.filter((id): id is string => typeof id === "string").slice(0, 5000));
  } else {
    return jsonError("حدد المنتجات المراد حذفها", 400);
  }

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم حذف ${deleted} منتج من الكتالوج بواسطة ${user.name}.`, "تنبيه", "الكتالوج");
  return jsonOk({ deleted });
}
