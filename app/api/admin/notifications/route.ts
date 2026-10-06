import { getAdminPermissions, requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getAdminNotifications } from "../../../../lib/notifications";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  // Each kind of notification follows the permission of the area it describes:
  // renewals -> clients, activity logs -> tech, email-quota warnings -> team.
  const permissions = await getAdminPermissions(admin.id);
  const allowed = new Set<string>();
  if (permissions.includes("clients")) allowed.add("renewal");
  if (permissions.includes("tech")) allowed.add("log");
  if (permissions.includes("team")) allowed.add("email");
  if (!allowed.size) return jsonOk([]);
  return jsonOk((await getAdminNotifications()).filter((item) => allowed.has(item.type)));
}
