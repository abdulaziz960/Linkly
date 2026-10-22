import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { listSallaLocations } from "../../../../../lib/salla";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/** Salla's countries, cities of a country, or districts of a city (needed to change an order's delivery address). */
export async function GET(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "salla") return jsonError("متاح لسلة فقط حاليًا", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const type = request.nextUrl.searchParams.get("type");
  if (type !== "countries" && type !== "cities" && type !== "districts") return jsonError("نوع غير صالح", 400);
  const result = await listSallaLocations(user.tenantId, type, request.nextUrl.searchParams.get("parent") || "");
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return jsonError("لجلب الدول والمدن فعّل صلاحية «Meta Data: Read Only» في تطبيق سلة وأضف metadata.read إلى SALLA_SCOPES ثم أعد الربط.", 400);
    return jsonError(result.status === 400 ? "بيانات غير صالحة" : "تعذر جلب القائمة من سلة", result.status === 400 ? 400 : 502);
  }
  return jsonOk({ items: result.items });
}
