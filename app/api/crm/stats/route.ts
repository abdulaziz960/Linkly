import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getCrmStats } from "../../../../lib/crm-stats";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Daily arrivals, visit bookings and attendance for the leads page. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const days = Number(new URL(request.url).searchParams.get("days")) || 14;
  return jsonOk(await getCrmStats(user.tenantId, days));
}
