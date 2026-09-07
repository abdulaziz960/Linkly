import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

// LinkClick has no tenantId - it's recorded from the anonymous marketing
// site, before any tenant exists, and there's only one marketing site
// (Linkly's own). Any authenticated user can read the aggregate click
// counts; matching them to won deals still respects tenant scoping via the
// conversations query in ReportsView itself.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const from = request.nextUrl.searchParams.get("from") || "";
  const to = request.nextUrl.searchParams.get("to") || "";
  const fromIso = from ? `${from}T00:00:00.000Z` : "";
  const toIso = to ? `${to}T23:59:59.999Z` : "";

  await ensureSchema();

  const clicks = await prisma.linkClick.findMany({
    where: fromIso && toIso ? { createdAt: { gte: fromIso, lte: toIso } } : {},
    select: { pageId: true, linkId: true, matchedConversationId: true }
  });

  const byPage = new Map<string, { pageId: string; clicks: number; matched: number }>();
  for (const click of clicks) {
    const entry = byPage.get(click.pageId) || { pageId: click.pageId, clicks: 0, matched: 0 };
    entry.clicks += 1;
    if (click.matchedConversationId) entry.matched += 1;
    byPage.set(click.pageId, entry);
  }

  return jsonOk({ byPage: Array.from(byPage.values()) });
}
