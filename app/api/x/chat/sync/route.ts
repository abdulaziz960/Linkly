import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { syncXChatForTenant } from "../../../../../lib/xchat/service";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** Reads the workspace's encrypted X conversations now and reports what happened (counts and X's error text only). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await syncXChatForTenant(user.tenantId));
}

export async function GET() {
  return POST();
}
