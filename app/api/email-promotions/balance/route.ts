import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { creditEmailCampaignBalance, getEmailCampaignBalance } from "../../../../lib/email-promotions";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk({ balance: await getEmailCampaignBalance(user.tenantId) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const body = await request.json().catch(() => null) as { credits?: number } | null;
  const credits = Number(body?.credits || 0);
  try {
    return jsonOk({ balance: await creditEmailCampaignBalance(user.tenantId, credits) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر إضافة الرصيد");
  }
}
