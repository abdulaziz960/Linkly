import { prisma } from "./prisma";
import { getIntegrationSettings } from "./database";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";
import { formatMessageTime } from "./time";

type SendWhatsAppTextInput = {
  tenantId?: string;
  conversationId: string;
  to: string;
  text: string;
  author?: string;
};

export async function sendWhatsAppTextMessage(input: SendWhatsAppTextInput) {
  const settings = await getIntegrationSettings("whatsapp", input.tenantId);
  const phoneNumberId = settings.phoneNumberId?.trim();
  const accessToken = settings.accessToken?.trim();
  const to = normalizeWhatsAppPhone(input.to);
  const text = input.text.trim();

  if (!phoneNumberId || !accessToken || !to || !text) {
    return { ok: false, skipped: true };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text
      }
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("WhatsApp AI text send failed", payload?.error || payload);
    return { ok: false, error: payload?.error?.message || "WHATSAPP_SEND_FAILED" };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: payload?.messages?.[0]?.id ? `wa-out-${payload.messages[0].id}` : `ai-out-${Date.now()}`,
        conversationId: input.conversationId,
        direction: "out",
        text,
        time: formatMessageTime(now),
        createdAt: now.toISOString(),
        author: input.author || "AudienceW AI"
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
