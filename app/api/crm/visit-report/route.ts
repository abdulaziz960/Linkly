import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getVisitReport } from "../../../../lib/crm-reports";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Visits -> attendance -> sales, by project and by employee, for the last N days. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const days = Number(new URL(request.url).searchParams.get("days")) || 30;
  return jsonOk(await getVisitReport(user.tenantId, days));
}
