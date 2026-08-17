import { prisma } from "./prisma";
import { getIntegrationSettings } from "./database";
import { formatMessageTime } from "./time";

type SendTelegramTextInput = {
  tenantId?: string;
  conversationId: string;
  chatId: string;
  text: string;
  author?: string;
};

export async function sendTelegramTextMessage(input: SendTelegramTextInput) {
  const settings = await getIntegrationSettings("telegram", input.tenantId);
  const botToken = settings.accessToken?.trim();
  const chatId = input.chatId.trim();
  const text = input.text.trim();

  if (!botToken || !chatId || !text) {
    return { ok: false, skipped: true };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    console.error("Telegram bot send failed", payload?.description || payload);
    return { ok: false, error: payload?.description || "TELEGRAM_SEND_FAILED" };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: payload.result?.message_id ? `tg-out-${chatId}-${payload.result.message_id}` : `bot-out-${Date.now()}`,
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
