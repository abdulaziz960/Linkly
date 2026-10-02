import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { FeedError, syncProductFeed } from "../../../../lib/product-feed";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "catalog"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  // Each call downloads and parses a remote file - cap how often it can be hammered.
  const limit = await consumeRateLimit("catalog-sync", requestIdentifier(request, user.tenantId), 6, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  try {
    return jsonOk(await syncProductFeed(user.tenantId));
  } catch (error) {
    return jsonError(error instanceof FeedError ? error.message : "تعذر مزامنة الملف", 422);
  }
}
