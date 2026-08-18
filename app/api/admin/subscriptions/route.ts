import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getSubscriptions } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getSubscriptions());
}
