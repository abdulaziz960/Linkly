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

async function getIncomingAttachment(message: Record<string, any>, accessToken: string) {
  const media = message.audio || message.image;
  const mediaId = media?.id;
  if (!mediaId || !accessToken) return undefined;

  const mediaResponse = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const mediaPayload = await mediaResponse.json().catch(() => null);
  const mediaUrl = mediaPayload?.url;
  const mimeType = mediaPayload?.mime_type || media?.mime_type || (message.audio ? "audio/ogg" : "image/jpeg");
  if (!mediaResponse.ok || !mediaUrl) return undefined;

  const fileResponse = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!fileResponse.ok) return undefined;

  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  const extension = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mpeg")
      ? "mp3"
      : mimeType.includes("mp4")
        ? "m4a"
        : mimeType.includes("png")
          ? "png"
          : mimeType.includes("webp")
            ? "webp"
            : "jpg";

  return {
    type: message.audio ? "audio" as const : "image" as const,
    url: `data:${mimeType};base64,${buffer.toString("base64")}`,
    name: `${message.audio ? "voice" : "image"}-${mediaId}.${extension}`,
    mimeType,
    metaMediaId: mediaId
  };
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const settings = await getIntegrationSettings();
  const accessToken = settings.accessToken?.trim() || "";
  const savedMessages: string[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];

      for (const status of statuses) {
        if (status.status === "failed" || status.errors?.length) {
          console.error("WhatsApp delivery status failed", {
            messageId: status.id,
            recipientId: status.recipient_id,
            status: status.status,
            errors: status.errors
          });
        }
      }

      for (const message of messages) {
        if (!message.from) continue;

        const contact = contacts.find((item: Record<string, any>) => item.wa_id === message.from);
        const text = getMessageText(message);
        const attachment = await getIncomingAttachment(message, accessToken);

        await storeWhatsAppMessage({
          phone: message.from,
          name: contact?.profile?.name,
          text,
          direction: "in",
          messageId: message.id,
          receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : undefined,
          attachment
        });

        savedMessages.push(message.id || message.from);
      }
    }
  }

  return NextResponse.json({ received: true, saved: savedMessages.length });
}
