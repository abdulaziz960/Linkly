import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { listSallaOrders, listSallaStatuses } from "../../../../../lib/salla";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/** Recent orders of the connected store with the statuses they can move to (Salla only for now). */
export async function GET(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "salla") return jsonError("إدارة الطلبات متاحة لسلة فقط حاليًا", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const page = Number(request.nextUrl.searchParams.get("page")) || 1;
  const [listed, statuses] = await Promise.all([listSallaOrders(user.tenantId, page), listSallaStatuses(user.tenantId)]);
  if (!listed.ok) {
    if (listed.status === 401) return jsonError("متجر سلة غير مربوط أو انتهت صلاحية الربط. اربط المتجر من تبويب الربط.", 400);
    if (listed.status === 403) return jsonError("صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحية الطلبات.", 400);
    return jsonError("تعذر جلب الطلبات من سلة", 502);
  }
  return jsonOk({ orders: listed.orders, statuses });
}
