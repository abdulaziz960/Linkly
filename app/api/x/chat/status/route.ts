import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { getXChatKeyStatus } from "../../../../../lib/xchat/keystore";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** Whether encrypted X Chat is on for the workspace. Never returns key material. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const status = await getXChatKeyStatus(user.tenantId);
  return jsonOk({ enabled: status.hasKeys && status.registered });
}
