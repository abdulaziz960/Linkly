import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const from = request.nextUrl.searchParams.get("from") || "";
  const to = request.nextUrl.searchParams.get("to") || "";
  const fromIso = from ? `${from}T00:00:00.000Z` : "";
  const toIso = to ? `${to}T23:59:59.999Z` : "";

  await ensureSchema();

  const clicks = await prisma.linkClick.findMany({
    where: { tenantId: user.tenantId, ...(fromIso && toIso ? { createdAt: { gte: fromIso, lte: toIso } } : {}) },
    select: { pageId: true, linkId: true, buttonId: true, matchedConversationId: true }
  });

  const byPage = new Map<string, { pageId: string; clicks: number; matched: number }>();
  const byButton = new Map<string, { buttonId: string; pageId: string; linkId: string; clicks: number; matched: number }>();
  for (const click of clicks) {
    const entry = byPage.get(click.pageId) || { pageId: click.pageId, clicks: 0, matched: 0 };
    entry.clicks += 1;
    if (click.matchedConversationId) entry.matched += 1;
    byPage.set(click.pageId, entry);
    const key = `${click.pageId}:${click.linkId}:${click.buttonId}`;
    const button = byButton.get(key) || { buttonId: click.buttonId, pageId: click.pageId, linkId: click.linkId, clicks: 0, matched: 0 };
    button.clicks += 1;
    if (click.matchedConversationId) button.matched += 1;
    byButton.set(key, button);
  }

  return jsonOk({
    byPage: Array.from(byPage.values()),
    byButton: Array.from(byButton.values()).sort((a, b) => b.matched - a.matched || b.clicks - a.clicks)
  });
}
