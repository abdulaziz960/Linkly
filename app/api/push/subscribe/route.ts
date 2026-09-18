import { getCurrentUser } from "../../../../lib/auth";
import { saveSubscription } from "../../../../lib/push-notifications";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) return jsonError("بيانات الاشتراك غير صالحة", 400);

  await saveSubscription(user.id, user.tenantId, { endpoint, keys: { p256dh, auth } });
  return jsonOk({ subscribed: true });
}
