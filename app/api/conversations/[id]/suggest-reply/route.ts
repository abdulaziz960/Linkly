import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { isAiReplyConfigured, suggestReply } from "../../../../../lib/ai-provider";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  if (!isAiReplyConfigured()) {
    return jsonOk({ suggestion: null, reason: "not_configured" });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { customer: true }
  });
  if (!conversation) return jsonError("المحادثة غير موجودة", 404);

  const body = (await request.json().catch(() => null)) as { language?: "ar" | "en" } | null;

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: { direction: true, text: true },
    take: 50
  });

  const suggestion = await suggestReply({
    messages: messages.map((message) => ({ direction: message.direction as "in" | "out" | "note", text: message.text })),
    customerName: conversation.customer.name,
    language: body?.language === "en" ? "en" : "ar"
  });

  return jsonOk({ suggestion });
}
