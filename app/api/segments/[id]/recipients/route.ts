import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { getSegmentById, getSegmentRecipientDetails } from "../../../../../lib/segments";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

/** The actual customer list (name, phone, source campaign) a segment currently resolves to - shown when expanding a row on the Segments page. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { id } = await context.params;
  const segment = await getSegmentById(user.tenantId, id);
  if (!segment) return jsonError("التقسيم غير موجود", 404);

  return jsonOk(await getSegmentRecipientDetails(user.tenantId, segment));
}
