import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { getBranch, getBranchStock, setBranchStock } from "../../../../../../lib/catalog-branches";
import { getProduct, listProductsForDashboard } from "../../../../../../lib/catalog";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest | null, id: string) {
  if (request && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  const branch = await getBranch(user.tenantId, id);
  if (!branch) return { error: jsonError("الفرع غير موجود", 404) };
  return { user, branch };
}

/** Every product with its stock at this branch (-1 = not tracked there). */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(null, id);
  if (auth.error) return auth.error;
  const [products, stock] = await Promise.all([listProductsForDashboard(auth.user.tenantId), getBranchStock(auth.user.tenantId, id)]);
  return jsonOk(products.map((product) => ({ id: product.id, name: product.name, stock: stock.get(product.id) ?? -1 })));
}

/** { productId, stock } - stock null or empty = not tracked at this branch. */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(request, id);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { productId?: unknown; stock?: unknown } | null;
  const productId = typeof body?.productId === "string" ? body.productId : "";
  if (!productId || !(await getProduct(auth.user.tenantId, productId))) return jsonError("المنتج غير موجود", 404);
  const raw = body?.stock;
  const stock = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (stock !== null && (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000)) return jsonError("الكمية غير صالحة", 400);
  await setBranchStock(auth.user.tenantId, id, productId, stock);
  return jsonOk({ productId, stock: stock ?? -1 });
}
