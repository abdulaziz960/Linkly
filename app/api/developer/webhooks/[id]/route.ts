import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { updateWebhook, deleteWebhook } from "../../../../../lib/webhooks";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "developers"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { active?: boolean } | null;
  const updated = await updateWebhook(user.tenantId, id, { active: body?.active });
  if (!updated) return jsonError("الـ Webhook غير موجود", 404);

  return jsonOk(updated);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "developers"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const deleted = await deleteWebhook(user.tenantId, id);
  if (!deleted) return jsonError("الـ Webhook غير موجود", 404);

  return jsonOk({ id });
}
