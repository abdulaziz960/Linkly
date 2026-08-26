import { getCurrentUser } from "../../../../lib/auth";
import { syncAutomaticQuickReplies } from "../../../../lib/database";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "quickReplies"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  await syncAutomaticQuickReplies(user.tenantId);
  return jsonOk({ synced: true });
}
