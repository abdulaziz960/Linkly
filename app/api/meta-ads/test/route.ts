import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { sendMetaTestEvent } from "../../../../lib/meta-events";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  const limit = await consumeRateLimit("meta-ads-test", user.tenantId, 10, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("بلغت حد المحاولات. حاول لاحقًا", 429);
  return jsonOk(await sendMetaTestEvent(user.tenantId));
}
