import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { formatMessageTime } from "../../../../lib/time";
import { sendXPostReply, XApiError } from "../../../../lib/x-api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });

  const body = await request.json().catch(() => null) as { messageId?: string; text?: string } | null;
  const messageId = body?.messageId?.trim() || "";
  const text = body?.text?.trim() || "";

  if (!messageId || !text) {
    return NextResponse.json({ ok: false, error: "معرّف المنشور ونص الرد مطلوبان" }, { status: 400 });
  }

  const sourceMessage = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversation: { tenantId: user.tenantId, channel: "x" }
    },
    include: { conversation: true }
  });

  if (!sourceMessage || sourceMessage.sourceType !== "x_post" || !sourceMessage.sourceId) {
    return NextResponse.json({ ok: false, error: "هذا العنصر ليس منشور X قابلًا للرد" }, { status: 400 });
  }

  const settings = await getIntegrationSettings("x", user.tenantId);

  try {
    const result = await sendXPostReply(settings, sourceMessage.sourceId, text);
    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          id: `x-post-out-${result.id}`,
          conversationId: sourceMessage.conversationId,
          direction: "out",
          text,
          time: formatMessageTime(now),
          createdAt: now.toISOString(),
          author: user.name || "",
          sourceType: "x_post_reply",
          sourceId: result.id || "",
          sourceUrl: result.id ? `https://x.com/i/web/status/${result.id}` : "",
          sourceLabel: "رد عبر X",
          replyToMessageId: sourceMessage.id,
          replyToText: sourceMessage.text.slice(0, 220),
          replyToAuthor: sourceMessage.author || "X"
        }
      });

      await tx.conversation.update({
        where: { id: sourceMessage.conversationId },
        data: { lastMessage: text, lastActivityAt: now.toISOString() }
      });

      return message;
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (error) {
    if (error instanceof XApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر الرد عبر X" }, { status: 500 });
  }
}
