/* eslint-disable @typescript-eslint/no-explicit-any -- Provider webhook payloads are polymorphic and validated at each access boundary. */
import { NextRequest, NextResponse } from "next/server";
import { convertAudioToMp3 } from "../../../../lib/audio-conversion";
import { getIntegrationSettings } from "../../../../lib/database";
import { storeFacebookMessage } from "../../../../lib/facebook-inbox";
import { storeInstagramMessage } from "../../../../lib/instagram-inbox";
import { runWhatsAppBot, runChannelBot } from "../../../../lib/bot-engine";
import { storeWhatsAppMessage } from "../../../../lib/whatsapp-inbox";
import { prisma } from "../../../../lib/prisma";
import { decryptSecret } from "../../../../lib/secret-storage";
import { verifyPrefixedHmac } from "../../../../lib/webhook-security";

export const runtime = "nodejs";

function verifyMetaSignature(rawBody: string, signature: string | null) {
  return verifyPrefixedHmac(rawBody, signature, [
    process.env.WHATSAPP_META_APP_SECRET,
    process.env.META_APP_SECRET,
    process.env.FACEBOOK_APP_SECRET,
    // Instagram direct-login events are signed with the "Linkly int" app's
    // own Instagram-specific secret, a different Meta app from the other
    // three above.
    process.env.INSTAGRAM_APP_SECRET
  ], "hex");
}

type MetaAccount = { tenantId: string; accessToken: string; wabaId: string };

// A stored access token that no longer decrypts under the current
// encryption key (rotated/regenerated since it was saved) must not drop
// the inbound message entirely - the tenant/wabaId are still real and the
// message still needs to be stored; only auto-reply sending (which already
// treats a blank accessToken as "not configured") is affected.
function decryptStoredAccessToken(value: string) {
  try {
    return decryptSecret(value).trim();
  } catch (error) {
    console.error("Meta webhook: failed to decrypt stored access token", error);
    return "";
  }
}

async function resolveMetaAccount(provider: "instagram" | "facebook", accountId: string): Promise<MetaAccount | null> {
  if (!accountId) return null;

  const row = await prisma.integrationSetting.findFirst({ where: { provider, wabaId: accountId } });
  if (!row) return null;

  return { tenantId: row.tenantId, accessToken: decryptStoredAccessToken(row.accessToken), wabaId: row.wabaId };
}

async function resolveWhatsAppAccount(phoneNumberId: string): Promise<MetaAccount | null> {
  if (!phoneNumberId) return null;

  const row = await prisma.integrationSetting.findFirst({ where: { provider: "whatsapp_cloud", phoneNumberId } });
  if (!row) return null;

  return { tenantId: row.tenantId, accessToken: decryptStoredAccessToken(row.accessToken), wabaId: row.wabaId };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const settings = await getIntegrationSettings();
  // Secret Manager values (and manual copy/paste into env config) can pick
  // up a trailing newline or surrounding whitespace that a strict === never
  // matches against Meta's clean query param - trim both sides so a
  // whitespace-only mismatch doesn't look identical to a wrong token.
  const allowedTokens = [process.env.META_WEBHOOK_VERIFY_TOKEN, settings.verifyToken]
    .filter(Boolean)
    .map((value) => value!.trim());
  const trimmedToken = token?.trim();

  if (mode === "subscribe" && trimmedToken && allowedTokens.includes(trimmedToken) && challenge) {
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
  if (message.document) return "مستند وارد";
  if (message.image) return "صورة واردة";
  if (message.audio) return "رسالة صوتية واردة";
  if (message.video) return "فيديو وارد";
  if (message.sticker) return "ملصق وارد";
  return "رسالة واردة من WhatsApp";
}

function getInstagramText(message: Record<string, any>) {
  if (message.message?.text) return message.message.text;
  if (message.text) return message.text;
  if (message.value?.text) return message.value.text;
  if (message.postback?.title) return message.postback.title;
  if (Array.isArray(message.message?.attachments) && message.message.attachments.length) return "مرفق وارد من Instagram";
  return "رسالة واردة من Instagram";
}

function getFacebookText(message: Record<string, any>) {
  if (message.message?.text) return message.message.text;
  if (message.text) return message.text;
  if (message.postback?.title) return message.postback.title;
  if (Array.isArray(message.message?.attachments) && message.message.attachments.length) return "مرفق وارد من Facebook";
  return "رسالة واردة من Facebook";
}

function hasInstagramMessageContent(event: Record<string, any>) {
  return Boolean(
    event.message?.text ||
      event.text ||
      event.value?.text ||
      event.postback?.title ||
      (Array.isArray(event.message?.attachments) && event.message.attachments.length)
  );
}

type InstagramProfile = {
  name?: string;
  username?: string;
};

type InstagramCommentSource = {
  type: string;
  id?: string;
  url?: string;
  label?: string;
};

async function getInstagramSenderProfile(instagramUserId: string, accessToken: string): Promise<InstagramProfile | undefined> {
  if (!instagramUserId || !accessToken) return undefined;

  const fields = "username,name";
  const endpoints = [
    `https://graph.instagram.com/v22.0/${instagramUserId}`,
    `https://graph.facebook.com/v22.0/${instagramUserId}`
  ];

  for (const endpoint of endpoints) {
    const url = new URL(endpoint);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);

    try {
      const response = await fetch(url);
      const payload = await response.json().catch(() => null);
      if (response.ok && payload) {
        return {
          name: typeof payload.name === "string" ? payload.name : undefined,
          username: typeof payload.username === "string" ? payload.username : undefined
        };
      }
    } catch (error) {
      console.error("Instagram sender profile lookup failed", error);
    }
  }

  return undefined;
}

async function getInstagramMediaSource(media: Record<string, any> | undefined, accessToken: string): Promise<InstagramCommentSource | undefined> {
  const mediaId = String(media?.id || media?.media_id || "");
  const directUrl = typeof media?.permalink === "string" ? media.permalink : "";
  const directLabel = typeof media?.caption === "string" ? media.caption : "";

  if (!mediaId && !directUrl) return undefined;

  const source: InstagramCommentSource = {
    type: "instagram_post",
    id: mediaId || undefined,
    url: directUrl || undefined,
    label: directLabel ? `بوست: ${directLabel.slice(0, 70)}` : "البوست المرتبط بالتعليق"
  };

  if (source.url || !mediaId || !accessToken) return source;

  const endpoints = [
    `https://graph.instagram.com/v22.0/${mediaId}`,
    `https://graph.facebook.com/v22.0/${mediaId}`
  ];

  for (const endpoint of endpoints) {
    const url = new URL(endpoint);
    url.searchParams.set("fields", "permalink,caption,media_type");
    url.searchParams.set("access_token", accessToken);

    try {
      const response = await fetch(url);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) continue;

      const permalink = typeof payload.permalink === "string" ? payload.permalink : "";
      const caption = typeof payload.caption === "string" ? payload.caption : "";
      return {
        ...source,
        url: permalink || source.url,
        label: caption ? `بوست: ${caption.slice(0, 70)}` : source.label
      };
    } catch (error) {
      console.error("Instagram media lookup failed", error);
    }
  }

  return source;
}

async function getIncomingAttachment(message: Record<string, any>, accessToken: string) {
  const media = message.audio || message.image || message.sticker || message.document;
  const mediaId = media?.id;
  if (!mediaId || !accessToken) return undefined;

  const mediaResponse = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const mediaPayload = await mediaResponse.json().catch(() => null);
  const mediaUrl = mediaPayload?.url;
  let mimeType = String(mediaPayload?.mime_type || media?.mime_type || (message.audio ? "audio/ogg" : message.sticker ? "image/webp" : message.document ? "application/octet-stream" : "image/jpeg"))
    .replace(/\s+/g, "");
  if (message.audio && mimeType === "audio/ogg") {
    mimeType = "audio/ogg;codecs=opus";
  }
  if (!mediaResponse.ok || !mediaUrl) return undefined;

  const fileResponse = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!fileResponse.ok) return undefined;

  let buffer: Buffer<ArrayBufferLike> = Buffer.from(await fileResponse.arrayBuffer());
  if (message.audio) {
    try {
      const converted = await convertAudioToMp3(buffer, mimeType);
      buffer = converted.buffer;
      mimeType = converted.mimeType;
    } catch (error) {
      console.error("Incoming audio conversion failed", error);
    }
  }

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
          : message.document
            ? message.document.filename?.split(".").pop() || "bin"
            : "jpg";

  return {
    type: message.audio ? "audio" as const : message.sticker ? "sticker" as const : message.document ? "document" as const : "image" as const,
    url: `data:${mimeType};base64,${buffer.toString("base64")}`,
    name: message.document?.filename || `${message.audio ? "voice" : message.sticker ? "sticker" : "image"}-${mediaId}.${extension}`,
    mimeType,
    metaMediaId: mediaId
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  const payload = JSON.parse(rawBody || "{}");
  const savedMessages: string[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const accountCache = new Map<string, MetaAccount | null>();

  async function lookupMetaAccount(provider: "instagram" | "facebook", accountId: string) {
    const cacheKey = `${provider}:${accountId}`;
    if (accountCache.has(cacheKey)) return accountCache.get(cacheKey) ?? null;
    const account = await resolveMetaAccount(provider, accountId);
    accountCache.set(cacheKey, account);
    return account;
  }

  async function lookupWhatsAppAccount(phoneNumberId: string) {
    const cacheKey = `whatsapp:${phoneNumberId}`;
    if (accountCache.has(cacheKey)) return accountCache.get(cacheKey) ?? null;
    const account = await resolveWhatsAppAccount(phoneNumberId);
    accountCache.set(cacheKey, account);
    return account;
  }

  for (const entry of entries) {
    const instagramMessaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const event of instagramMessaging) {
      const senderId = event.sender?.id;
      if (!senderId) continue;
      const recipientId = String(event.recipient?.id || entry.id || "");
      const facebookAccount = await lookupMetaAccount("facebook", recipientId);

      if (facebookAccount) {
        const isEchoMessage = event.message?.is_echo === true || event.message?.is_deleted === true;
        if (senderId === facebookAccount.wabaId || isEchoMessage || !hasInstagramMessageContent(event)) {
          continue;
        }

        const storedFacebook = await storeFacebookMessage({
          facebookUserId: senderId,
          text: getFacebookText(event),
          direction: "in",
          tenantId: facebookAccount.tenantId,
          messageId: event.message?.mid || event.postback?.mid,
          receivedAt: event.timestamp ? new Date(Number(event.timestamp)) : undefined,
          replyToMessageId: event.message?.reply_to?.mid || event.reply_to?.mid || event.reply_to?.id
        });
        await runChannelBot("facebook", {
          tenantId: facebookAccount.tenantId,
          conversationId: storedFacebook.conversationId,
          recipientId: senderId,
          incomingText: getFacebookText(event)
        });
        savedMessages.push(event.message?.mid || senderId);
        continue;
      }

      const instagramAccount = await lookupMetaAccount("instagram", recipientId);
      if (!instagramAccount) continue;

      const isEchoMessage = event.message?.is_echo === true || event.message?.is_deleted === true;
      if (senderId === instagramAccount.wabaId || isEchoMessage || !hasInstagramMessageContent(event)) {
        continue;
      }

      const text = getInstagramText(event);
      const profile = await getInstagramSenderProfile(senderId, instagramAccount.accessToken);
      const storedInstagram = await storeInstagramMessage({
        instagramUserId: senderId,
        name: profile?.username || profile?.name,
        text,
        direction: "in",
        tenantId: instagramAccount.tenantId,
        messageId: event.message?.mid || event.postback?.mid,
        receivedAt: event.timestamp ? new Date(Number(event.timestamp)) : undefined,
        replyToMessageId: event.message?.reply_to?.mid || event.reply_to?.mid || event.reply_to?.id
      });
      await runChannelBot("instagram", {
        tenantId: instagramAccount.tenantId,
        conversationId: storedInstagram.conversationId,
        recipientId: senderId,
        incomingText: text
      });
      savedMessages.push(event.message?.mid || senderId);
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change.value || {};
      if (change.field === "comments" || value.media || value.comment_id || value.from?.id) {
        const instagramUserId = value.from?.id || value.user_id || value.sender_id || value.id;
        if (instagramUserId) {
          const instagramAccount = await lookupMetaAccount("instagram", String(entry.id || ""));
          if (!instagramAccount) continue;
          if (instagramUserId === instagramAccount.wabaId) continue;
          const text = value.text || value.message || "تعليق وارد من Instagram";
          const fallbackName = value.from?.username || value.from?.name;
          const profile = fallbackName ? undefined : await getInstagramSenderProfile(instagramUserId, instagramAccount.accessToken);
          const source = await getInstagramMediaSource(value.media, instagramAccount.accessToken);
          await storeInstagramMessage({
            instagramUserId,
            name: fallbackName || profile?.username || profile?.name,
            text: `تعليق: ${text}`,
            direction: "in",
            tenantId: instagramAccount.tenantId,
            messageId: value.comment_id || value.id,
            receivedAt: value.created_time ? new Date(Number(value.created_time) * 1000) : undefined,
            source
          });
          savedMessages.push(value.comment_id || value.id || instagramUserId);
          continue;
        }
      }

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      const phoneNumberId = String(value.metadata?.phone_number_id || "");
      const whatsappAccount = phoneNumberId ? await lookupWhatsAppAccount(phoneNumberId) : null;

      if (!whatsappAccount) continue;

      for (const status of statuses) {
        if (status.status === "failed" || status.errors?.length) {
          console.error("WhatsApp delivery status failed", {
            messageId: status.id,
            recipientId: status.recipient_id,
            status: status.status,
            errors: status.errors
          });
        }

        if (!status.id || !status.status) continue;
        try {
          await prisma.message.updateMany({
            where: {
              id: { in: [`wa-${status.id}`, `wa-out-${status.id}`] },
              conversation: { tenantId: whatsappAccount.tenantId }
            },
            data: {
              deliveryStatus: status.status,
              deliveryError: status.status === "failed" ? (status.errors?.[0]?.title || status.errors?.[0]?.message || "") : ""
            }
          });
        } catch (error) {
          console.error("Failed to persist WhatsApp delivery status", error);
        }
      }

      for (const message of messages) {
        if (!message.from) continue;

        const contact = contacts.find((item: Record<string, any>) => item.wa_id === message.from);
        const text = getMessageText(message);
        const attachment = await getIncomingAttachment(message, whatsappAccount.accessToken);

        const stored = await storeWhatsAppMessage({
          phone: message.from,
          name: contact?.profile?.name,
          text,
          direction: "in",
          tenantId: whatsappAccount.tenantId,
          messageId: message.id,
          receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : undefined,
          attachment,
          replyToMessageId: message.context?.id
        });

        if (stored.isNew) {
          await runWhatsAppBot({
            tenantId: whatsappAccount.tenantId,
            conversationId: stored.conversationId,
            phone: message.from,
            incomingText: text
          });
        }

        savedMessages.push(message.id || message.from);
      }
    }
  }

  return NextResponse.json({ received: true, saved: savedMessages.length });
}
