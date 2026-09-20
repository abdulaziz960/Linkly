import { getCurrentUser } from "../../../../lib/auth";
import { removeSubscription } from "../../../../lib/push-notifications";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return jsonError("بيانات الاشتراك غير صالحة", 400);

  await removeSubscription(endpoint, user.id);
  return jsonOk({ unsubscribed: true });
}
