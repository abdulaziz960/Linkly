import { prisma } from "./prisma";
import { getIntegrationSettings } from "./database";
import { sendXDirectMessage } from "./x-api";
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

  let result: { dm_event_id?: string; dm_conversation_id?: string } | undefined;
  try {
    result = await sendXDirectMessage(settings, recipientId, text);
  } catch (error) {
    console.error("X bot send failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "X_SEND_FAILED" };
  }

  const now = new Date();
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
