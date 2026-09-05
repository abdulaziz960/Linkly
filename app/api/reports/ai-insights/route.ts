import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "reports"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const insights = await prisma.conversationInsight.findMany({
    where: {
      tenantId: user.tenantId,
      createdAt: {
        gte: from ? `${from}T00:00:00.000Z` : undefined,
        lte: to ? `${to}T23:59:59.999Z` : undefined
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const conversations = await prisma.conversation.findMany({
    where: { id: { in: insights.map((insight) => insight.conversationId) } },
    select: { id: true, channel: true, closedAt: true, customer: { select: { name: true } } }
  });
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  const items = insights.map((insight) => {
    const conversation = conversationById.get(insight.conversationId);
    return {
      conversationId: insight.conversationId,
      customerName: conversation?.customer.name || "",
      channel: conversation?.channel || "",
      closedAt: conversation?.closedAt || "",
      intent: insight.intent,
      satisfactionLevel: insight.satisfactionLevel,
      summary: insight.summary
    };
  });

  const byIntent: Record<string, number> = {};
  const bySatisfaction: Record<string, number> = {};
  for (const item of items) {
    if (item.intent) byIntent[item.intent] = (byIntent[item.intent] || 0) + 1;
    if (item.satisfactionLevel) bySatisfaction[item.satisfactionLevel] = (bySatisfaction[item.satisfactionLevel] || 0) + 1;
  }

  return jsonOk({ items, breakdown: { total: items.length, byIntent, bySatisfaction } });
}
