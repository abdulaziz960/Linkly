import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { getProductBranches, setProductBranches } from "../../../../../../lib/catalog-branches";
import { getProduct } from "../../../../../../lib/catalog";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest | null, id: string) {
  if (request && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  if (!(await getProduct(user.tenantId, id))) return { error: jsonError("المنتج غير موجود", 404) };
  return { user };
}

/** The branches of the Branches page with whether this product is sold at each, and its quantity there. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(null, id);
  if (auth.error) return auth.error;
  return jsonOk(await getProductBranches(auth.user.tenantId, id));
}

/** { branches: [{ id, available, stock }] } - stock null or empty = sold without counting. */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(request, id);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { branches?: unknown } | null;
  if (!Array.isArray(body?.branches)) return jsonError("طلب غير صالح", 400);
  const items = (body.branches as Array<Record<string, unknown>>).slice(0, 100).map((item) => {
    const raw = item.stock;
    const stock = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    return { id: typeof item.id === "string" ? item.id : "", available: item.available !== false, stock: stock !== null && Number.isFinite(stock) && stock >= 0 && stock <= 1_000_000 ? stock : null };
  });
  await setProductBranches(auth.user.tenantId, id, items);
  return jsonOk(await getProductBranches(auth.user.tenantId, id));
}
