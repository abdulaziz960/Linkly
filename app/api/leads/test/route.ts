import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { openApiConversation } from "../../../../lib/developer-api";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

// A phone that belongs to nobody: repeated tests reuse the same test customer instead of piling up leads.
const TEST_PHONE = "0500000000";

/** Creates (or refreshes) a clearly-marked test lead, to check that the leads page and inbox receive leads. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const limit = await consumeRateLimit("lead-test", user.tenantId, 10, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("بلغت حد المحاولات. حاول لاحقًا", 429);

  try {
    const { conversationId } = await openApiConversation(user.tenantId, {
      customerPhone: TEST_PHONE,
      customerName: "ليد تجريبي",
      text: "هذا ليد تجريبي من لنكلي للتأكد من وصول الليدات. يمكنك حذفه."
    });
    return jsonOk({ conversationId });
  } catch (error) {
    console.error("Test lead failed", error);
    return jsonError("تعذر إنشاء الليد التجريبي", 500);
  }
}
