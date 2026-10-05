import { getAdminPermissions, requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getAdminNotifications } from "../../../../lib/notifications";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  // Notifications mention clients and renewals, so they follow the "clients" permission.
  if (!(await getAdminPermissions(admin.id)).includes("clients")) return jsonOk([]);
  return jsonOk(await getAdminNotifications());
}
