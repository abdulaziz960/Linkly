import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { ORDER_STATUSES, updateOrderStatus, type OrderStatus } from "../../../../../lib/catalog";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  if (!body?.status || !(ORDER_STATUSES as readonly string[]).includes(body.status)) return jsonError("حالة الطلب غير صالحة", 400);

  const ok = await updateOrderStatus(user.tenantId, id, body.status as OrderStatus);
  return ok ? jsonOk({ id, status: body.status }) : jsonError("الطلب غير موجود", 404);
}
