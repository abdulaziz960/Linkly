import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getCrossCampaignEngagement } from "../../../../lib/segments";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/** All-customers, cross-campaign engagement breakdown shown on the Segments page - optionally narrowed to a send-date range. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom")?.trim() || "";
  const dateTo = searchParams.get("dateTo")?.trim() || "";
  if ((dateFrom && !isoDatePattern.test(dateFrom)) || (dateTo && !isoDatePattern.test(dateTo))) {
    return jsonError("تنسيق التاريخ غير صالح");
  }
  if (dateFrom && dateTo && dateFrom > dateTo) return jsonError("تاريخ البداية يجب أن يسبق تاريخ النهاية");

  return jsonOk(await getCrossCampaignEngagement(user.tenantId, dateFrom, dateTo));
}
