import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { dailyReport, isValidDay, todayInRiyadh } from "../../../../lib/catalog-daily-report";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** ?day=YYYY-MM-DD (default today, Saudi time) &branch=<branch name> (optional). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const requested = request.nextUrl.searchParams.get("day");
  if (requested && !isValidDay(requested)) return jsonError("تاريخ غير صالح", 400);
  const branch = (request.nextUrl.searchParams.get("branch") ?? "").slice(0, 120);
  return jsonOk(await dailyReport(user.tenantId, requested || todayInRiyadh(), branch));
}
