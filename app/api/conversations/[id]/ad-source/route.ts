import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { canAccessConversation } from "../../../../../lib/permissions-server";
import { ensureTikTokThumbnail, getAdSource } from "../../../../../lib/ad-source";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** The ad that opened a conversation (null when it did not come from an ad). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const { id } = await params;
  if (!(await canAccessConversation(user, id))) return jsonError("المحادثة غير موجودة", 404);
  const stored = await getAdSource(user.tenantId, id);
  const source = stored ? await ensureTikTokThumbnail(user.tenantId, id, stored) : null;
  // The raw payload is for diagnosis only and is not sent to the browser.
  return jsonOk(source ? { platform: source.platform, adId: source.adId, headline: source.headline, sourceUrl: source.sourceUrl, thumbnailUrl: source.thumbnailUrl, mediaType: source.mediaType, hasClickId: Boolean(source.clickId), fromForm: source.matchedBy === "lead_form", createdAt: source.createdAt } : null);
}
