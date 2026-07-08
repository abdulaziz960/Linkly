import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { storeWhatsAppMessage } from "../../../../lib/whatsapp-inbox";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const settings = await getIntegrationSettings();
  const allowedTokens = [process.env.META_WEBHOOK_VERIFY_TOKEN, settings.verifyToken].filter(Boolean);

  if (mode === "subscribe" && token && allowedTokens.includes(token) && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

function getMessageText(message: Record<string, any>) {
  if (message.text?.body) return message.text.body;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  if (message.image?.caption) return message.image.caption;
  if (message.document?.caption) return message.document.caption;
  if (message.document?.filename) return message.document.filename;
  if (message.image) return "صورة واردة";
  if (message.audio) return "رسالة صوتية واردة";
  if (message.video) return "فيديو وارد";
  if (message.sticker) return "ملصق وارد";
  return "رسالة واردة من WhatsApp";
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  await getIntegrationSettings();
  const savedMessages: string[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        if (!message.from) continue;

        const contact = contacts.find((item: Record<string, any>) => item.wa_id === message.from);
        const text = getMessageText(message);

        await storeWhatsAppMessage({
          phone: message.from,
          name: contact?.profile?.name,
          text,
          direction: "in",
          messageId: message.id,
          receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : undefined
        });

        savedMessages.push(message.id || message.from);
      }
    }
  }

  return NextResponse.json({ received: true, saved: savedMessages.length });
}
