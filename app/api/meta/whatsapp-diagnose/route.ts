import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { diagnoseWhatsApp } from "../../../../lib/whatsapp-diagnose";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Settings → WhatsApp → "فحص الربط": asks Meta why sending may be refused. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const limit = await consumeRateLimit("whatsapp-diagnose", user.tenantId, 10, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة، حاول بعد قليل", 429);
  return jsonOk(await diagnoseWhatsApp(user.tenantId));
}
