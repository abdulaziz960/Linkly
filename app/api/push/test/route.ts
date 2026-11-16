import { getCurrentUser } from "../../../../lib/auth";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { sendTestPush } from "../../../../lib/push-notifications";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Sends a test notification to the signed-in user's own registered devices and says what happened. */
export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const result = await sendTestPush(user.id, {
    title: "اختبار الإشعارات ✅",
    body: "وصلك هذا الإشعار، يعني أن جهازك جاهز لاستقبال رسائل العملاء.",
    url: "/dashboard?view=inbox",
    tag: `test-${Date.now()}`
  });
  return jsonOk(result);
}
