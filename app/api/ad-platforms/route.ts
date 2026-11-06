import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { listPlatformEvents, listPlatformLeads, parsePlatform, parseRange } from "../../../lib/platform-activity";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

/** GET /api/ad-platforms?platform=meta|snapchat|tiktok&kind=leads|events&range=24h|7d|30d|all */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const params = request.nextUrl.searchParams;
  const platform = parsePlatform(params.get("platform"));
  if (!platform) return jsonError("منصة غير معروفة", 400);
  const range = parseRange(params.get("range"));
  if (params.get("kind") === "events") return jsonOk({ events: await listPlatformEvents(user.tenantId, platform, range) });
  return jsonOk({ leads: await listPlatformLeads(user.tenantId, platform, range) });
}
