import { prisma } from "./prisma";
import { getIntegrationSettings } from "./database";
import { sendXDirectMessage, sendXPostReply } from "./x-api";
import { resolveXPostReplyTarget } from "./x-reply-target";
import { formatMessageTime } from "./time";

type SendXTextInput = {
  tenantId?: string;
  conversationId: string;
  recipientId: string;
  text: string;
  author?: string;
};

export async function sendXTextMessage(input: SendXTextInput) {
  const settings = await getIntegrationSettings("x", input.tenantId);
  const recipientId = input.recipientId.trim();
  const text = input.text.trim();

  if (!settings.accessToken.trim() && !settings.xAccessToken.trim()) {
    return { ok: false, skipped: true };
  }
  if (!recipientId || !text) {
    return { ok: false, skipped: true };
  }

  // Bot/automation replies must keep the same public-reply-vs-DM logic as a
  // manual agent reply: a conversation whose latest message is a public
  // mention/comment gets a public reply on that post, not a DM. Without
  // this, the bot's own reply to a public mention would go out as a DM and
  // become the conversation's newest message, permanently flipping every
  // later reply (including manual ones) onto the DM path too.
  const postTarget = await resolveXPostReplyTarget(input.conversationId);

  const now = new Date();
  if (postTarget?.sourceId) {
    let postResult: { id?: string } | undefined;
    try {
      postResult = await sendXPostReply(settings, postTarget.sourceId, text);
    } catch (error) {
      console.error("X bot post reply failed", error);
      return { ok: false, error: error instanceof Error ? error.message : "X_SEND_FAILED" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          id: postResult?.id ? `x-post-out-${postResult.id}` : `bot-out-${Date.now()}`,
          conversationId: input.conversationId,
          direction: "out",
          text,
          time: formatMessageTime(now),
          createdAt: now.toISOString(),
          author: input.author || "الرد الآلي",
          sourceType: "x_post_reply",
          sourceId: postResult?.id || "",
          sourceUrl: postResult?.id ? `https://x.com/i/web/status/${postResult.id}` : "",
          sourceLabel: "رد عبر X",
          replyToMessageId: postTarget.id,
          replyToText: (postTarget.text || "منشور").slice(0, 220),
          replyToAuthor: postTarget.author || ""
        }
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          lastMessage: text,
          lastActivityAt: now.toISOString()
        }
      });
    });

    return { ok: true };
  }

  let result: { dm_event_id?: string; dm_conversation_id?: string } | undefined;
  try {
    result = await sendXDirectMessage(settings, recipientId, text);
  } catch (error) {
    console.error("X bot send failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "X_SEND_FAILED" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: result?.dm_event_id ? `x-out-${result.dm_event_id}` : `bot-out-${Date.now()}`,
        conversationId: input.conversationId,
        direction: "out",
        text,
        time: formatMessageTime(now),
        createdAt: now.toISOString(),
        author: input.author || "الرد الآلي",
        sourceType: "x_dm",
        sourceId: result?.dm_conversation_id || ""
      }
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessage: text,
        lastActivityAt: now.toISOString()
      }
    });
  });

  return { ok: true };
}
