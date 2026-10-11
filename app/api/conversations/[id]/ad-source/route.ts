import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getAdSource } from "../../../../../lib/ad-source";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** The ad that opened a conversation (null when it did not come from an ad). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  const { id } = await params;
  const owned = await prisma.conversation.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
  if (!owned) return jsonError("المحادثة غير موجودة", 404);
  const source = await getAdSource(user.tenantId, id);
  // The raw payload is for diagnosis only and is not sent to the browser.
  return jsonOk(source ? { platform: source.platform, adId: source.adId, headline: source.headline, sourceUrl: source.sourceUrl, hasClickId: Boolean(source.clickId), createdAt: source.createdAt } : null);
}
