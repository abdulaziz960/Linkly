import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../lib/permissions-server";
import { getEmailSegmentRow, resolveEmailSegmentMembers } from "../../../../../../lib/email-segments";
import { jsonError, jsonOk } from "../../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const { id } = await context.params;
  const segment = await getEmailSegmentRow(user.tenantId, id);
  if (!segment) return jsonError("التقسيم غير موجود", 404);
  return jsonOk(await resolveEmailSegmentMembers(user.tenantId, segment));
}
