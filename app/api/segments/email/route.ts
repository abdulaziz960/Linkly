import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { listEmailSegments, saveEmailSegment, validateEmailSegment } from "../../../../lib/email-segments";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments")) && !(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk(await listEmailSegments(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const body = await request.json().catch(() => null);
  const checked = await validateEmailSegment(user.tenantId, body);
  if ("error" in checked) return jsonError(checked.error);
  const id = await saveEmailSegment(user.tenantId, checked.value);
  return jsonOk({ id });
}
