import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { cleanProductInput, createProduct, listProductsForDashboard, type ProductInput } from "../../../../lib/catalog";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk(await listProductsForDashboard(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as ProductInput | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const cleaned = cleanProductInput(body);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  const product = await createProduct(user.tenantId, { ...cleaned.data, externalId: "" }, "manual");
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تمت إضافة المنتج "${product.name}" بواسطة ${user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(product);
}
