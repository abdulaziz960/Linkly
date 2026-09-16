import { getCurrentUser } from "../../../../lib/auth";
import { getVapidPublicKey } from "../../../../lib/push-notifications";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

// Kept server-only (not NEXT_PUBLIC_) so it's a plain runtime env var - no
// rebuild needed to rotate it, same reasoning as GEMINI_API_KEY (see
// .env.example). The client fetches it once before calling
// pushManager.subscribe().
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const publicKey = getVapidPublicKey();
  if (!publicKey) return jsonError("الإشعارات غير مفعّلة على هذا الخادم", 501);

  return jsonOk({ publicKey });
}
