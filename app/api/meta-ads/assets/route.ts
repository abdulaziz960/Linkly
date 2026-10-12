import { getCurrentUser } from "../../../../lib/auth";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { listAdAssets } from "../../../../lib/meta-events";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** The signed-in Meta user's ad accounts and datasets, for the picker. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  const limit = await consumeRateLimit("meta-ads-assets", user.tenantId, 30, 60 * 60 * 1000);
  if (!limit.allowed) return jsonError("بلغت حد المحاولات. حاول لاحقًا", 429);
  const result = await listAdAssets(user.tenantId);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ accounts: result.accounts });
}
