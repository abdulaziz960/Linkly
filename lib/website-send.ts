import { prisma } from "./prisma";
import { formatMessageTime } from "./time";

type SendWebsiteTextInput = {
  conversationId: string;
  text: string;
  author?: string;
};

export async function sendWebsiteTextMessage(input: SendWebsiteTextInput) {
  const text = input.text.trim();
  if (!text) return { ok: false, skipped: true };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: `bot-out-${Date.now()}`,
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
