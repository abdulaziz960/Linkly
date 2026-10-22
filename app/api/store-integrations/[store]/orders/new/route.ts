import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../lib/permissions-server";
import { listSallaBranches } from "../../../../../../lib/salla";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/** What the new-order form needs besides products: the store's branches (for pickup). */
export async function GET(_request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "salla") return jsonError("إنشاء الطلبات متاح لسلة فقط حاليًا", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk({ branches: await listSallaBranches(user.tenantId) });
}
