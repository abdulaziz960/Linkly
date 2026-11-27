import { getCurrentUser } from "../../../../lib/auth";
import { getEmailCampaignBalance } from "../../../../lib/email-promotions";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

// Read only: credit is added by a verified payment (confirm-payment), never by a request that just names a number.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk({ balance: await getEmailCampaignBalance(user.tenantId) });
}
