import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { deleteEmailSegment, saveEmailSegment, validateEmailSegment } from "../../../../../lib/email-segments";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const checked = await validateEmailSegment(user.tenantId, body);
  if ("error" in checked) return jsonError(checked.error);
  const saved = await saveEmailSegment(user.tenantId, checked.value, id);
  if (!saved) return jsonError("التقسيم غير موجود", 404);
  return jsonOk({ id: saved });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await context.params;
  if (!(await deleteEmailSegment(user.tenantId, id))) return jsonError("التقسيم غير موجود", 404);
  return jsonOk({ id });
}
