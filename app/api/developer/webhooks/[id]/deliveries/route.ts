import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../lib/permissions-server";
import { listWebhookDeliveries } from "../../../../../../lib/webhooks";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "developers"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const deliveries = await listWebhookDeliveries(user.tenantId, id);
  return jsonOk(deliveries.map((delivery) => ({
    id: delivery.id,
    event: delivery.event,
    httpStatus: delivery.httpStatus,
    success: Boolean(delivery.success),
    createdAt: delivery.createdAt
  })));
}
