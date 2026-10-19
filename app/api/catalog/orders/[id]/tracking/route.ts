import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../lib/permissions-server";
import { saveOrderTracking } from "../../../../../../lib/order-tracking";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("بيانات غير صالحة", 400);
  const result = await saveOrderTracking(user.tenantId, id, body);
  return result.ok ? jsonOk({ tracking: result.tracking, notified: result.notified }) : jsonError(result.error, result.status);
}
