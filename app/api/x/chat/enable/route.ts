import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getTenantCompanyName, logAdminAction } from "../../../../../lib/subscriptions";
import { isChannelAllowedForTenant } from "../../../../../lib/plan-channel-access";
import { enableXChat } from "../../../../../lib/xchat/service";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/**
 * Turns on encrypted X Chat for the workspace's connected X account: creates the account's chat keys and registers their
 * public half with X. POST only and owner only - it changes the account's encryption keys at X.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("تفعيل الرسائل المشفّرة متاح لمالك الحساب فقط", 403);
  if (!(await isChannelAllowedForTenant(user.tenantId, "x"))) return jsonError("قناة X غير متاحة في باقتك الحالية", 403);

  const result = await enableXChat(user.tenantId);
  if (!result.ok) return jsonError(result.error, 502);
  if (!result.alreadyEnabled) {
    await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تفعيل الرسائل المشفّرة لحساب X بواسطة ${user.name}.`, "معلومة", "التكاملات").catch(() => {});
  }
  return jsonOk({ enabled: true, alreadyEnabled: result.alreadyEnabled });
}
