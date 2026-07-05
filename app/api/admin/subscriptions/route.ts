import { getCurrentUser } from "../../../../lib/auth";
import { getProviderSubscriptions } from "../../../../lib/database";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("لا تملك صلاحية الوصول", 403);

  return jsonOk(await getProviderSubscriptions());
}
