import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { searchSallaProducts } from "../../../../../lib/salla";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/** Products of the connected Salla store matching a search word (for the new-order form). */
export async function GET(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "salla") return jsonError("إنشاء الطلبات متاح لسلة فقط حاليًا", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const result = await searchSallaProducts(user.tenantId, request.nextUrl.searchParams.get("q") || "");
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return jsonError("صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحية المنتجات.", 400);
    return jsonError("تعذر جلب المنتجات من سلة", 502);
  }
  return jsonOk({ products: result.products });
}
