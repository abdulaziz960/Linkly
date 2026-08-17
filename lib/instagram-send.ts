import { prisma } from "./prisma";
import { getIntegrationSettings } from "./database";
import { formatMessageTime } from "./time";

type SendInstagramTextInput = {
  tenantId?: string;
  conversationId: string;
  recipientId: string;
  text: string;
  author?: string;
};

export async function sendInstagramTextMessage(input: SendInstagramTextInput) {
  const settings = await getIntegrationSettings("instagram", input.tenantId);
  const instagramAccountId = settings.wabaId?.trim();
  const accessToken = settings.accessToken?.trim();
  const recipientId = input.recipientId.trim();
  const text = input.text.trim();

  if (!instagramAccountId || !accessToken || !recipientId || !text) {
    return { ok: false, skipped: true };
  }

  const response = await fetch(`https://graph.instagram.com/v22.0/${instagramAccountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
  });
  const payload = await response.json().catch(() => null) as {
    message_id?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    console.error("Instagram bot send failed", payload?.error || payload);
    return { ok: false, error: payload?.error?.message || "INSTAGRAM_SEND_FAILED" };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: payload?.message_id ? `ig-out-${payload.message_id}` : `bot-out-${Date.now()}`,
        conversationId: input.conversationId,
        direction: "out",
        text,
        time: formatMessageTime(now),
        createdAt: now.toISOString(),
        author: input.author || "الرد الآلي"
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
