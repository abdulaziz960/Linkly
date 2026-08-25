import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { convertAudioToMp3 } from "../../../../../lib/audio-conversion";
import { getIntegrationSettings } from "../../../../../lib/database";
import { sendEmailMessage } from "../../../../../lib/email-channel";
import { replyToGoogleReview } from "../../../../../lib/google-business";
import { sendUnifonicSms } from "../../../../../lib/sms-send";
import { prisma } from "../../../../../lib/prisma";
import { formatMessageTime } from "../../../../../lib/time";
import { normalizeWhatsAppPhone } from "../../../../../lib/whatsapp-inbox";
import { sendXDirectMessage, XApiError } from "../../../../../lib/x-api";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ConversationSnapshot = {
  id?: string;
  customer?: string;
  phone?: string;
  initial?: string;
  assignee?: string;
  status?: string;
};

type AttachmentPayload = {
  type?: "image" | "audio" | "document";
  name?: string;
  dataUrl?: string;
  mimeType?: string;
};

class MetaSendError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MetaSendError";
    this.status = status;
  }
}

export const runtime = "nodejs";

function normalizeTemplateLanguage(language?: string) {
  const value = language?.trim();
  if (!value || value === "Arabic" || value === "العربية") return "ar";
  if (value === "English" || value === "الإنجليزية") return "en_US";
  return value;
}

function normalizeConversationStatus(status?: string) {
  if (status === "assigned" || status === "closed" || status === "unassigned") return status;
  return "unassigned";
}

function getFallbackInitial(name: string, phone: string, initial?: string) {
  return initial?.trim() || name.trim().charAt(0) || phone.slice(-1) || "ع";
}

function getPhoneFromConversationId(id: string) {
  const value = id.trim();
  if (!value.startsWith("conv-")) return "";
  return value.slice(5);
}

function parseDataUrl(dataUrl?: string) {
  const match = dataUrl?.match(/^data:([^,]+);base64,(.+)$/);
  if (!match) return null;

  const mediaType = match[1].replace(/\s+/g, "");

  return {
    mimeType: mediaType,
    buffer: Buffer.from(match[2], "base64")
  };
}

function getBaseMimeType(mimeType: string) {
  return mimeType.split(";")[0].trim().toLowerCase();
}

function isSupportedWhatsAppAudio(mimeType: string) {
  const baseMimeType = getBaseMimeType(mimeType);

  return [
    "audio/aac",
    "audio/mp4",
    "audio/mpeg",
    "audio/amr",
    "audio/ogg"
  ].includes(baseMimeType);
}

function isConvertibleAudio(mimeType: string) {
  return isSupportedWhatsAppAudio(mimeType) || ["audio/webm", "audio/wav", "audio/x-wav"].includes(getBaseMimeType(mimeType));
}

function getConvertedAudioName(fileName?: string) {
  return `${fileName?.replace(/\.[^.]+$/, "") || `voice-${Date.now()}`}.mp3`;
}

function getWhatsAppContextMessageId(messageId?: string) {
  if (!messageId) return "";
  if (messageId.startsWith("wa-out-")) return messageId.slice("wa-out-".length);
  if (messageId.startsWith("wa-")) return messageId.slice("wa-".length);
  return messageId.startsWith("wamid.") ? messageId : "";
}

async function normalizeAudioAttachment(attachment: AttachmentPayload) {
  if (attachment.type !== "audio") return attachment;

  const parsed = parseDataUrl(attachment.dataUrl);
  if (!parsed) throw new Error("INVALID_ATTACHMENT");

  const mimeType = (attachment.mimeType || parsed.mimeType).replace(/\s+/g, "");
  if (!isConvertibleAudio(mimeType)) {
    throw new Error("UNSUPPORTED_AUDIO_FORMAT");
  }

  try {
    const converted = await convertAudioToMp3(parsed.buffer, mimeType);

    return {
      ...attachment,
      name: getConvertedAudioName(attachment.name),
      dataUrl: `data:${converted.mimeType};base64,${converted.buffer.toString("base64")}`,
      mimeType: converted.mimeType
    };
  } catch (error) {
    console.error("Outgoing audio conversion failed", error);
    throw new Error("AUDIO_CONVERSION_FAILED");
  }
}

async function uploadWhatsAppMedia(phoneNumberId: string, accessToken: string, attachment: Required<Pick<AttachmentPayload, "type" | "name" | "dataUrl">> & AttachmentPayload) {
  const parsed = parseDataUrl(attachment.dataUrl);
  if (!parsed) throw new Error("INVALID_ATTACHMENT");
  if (parsed.buffer.length > 8 * 1024 * 1024) throw new Error("ATTACHMENT_TOO_LARGE");

  const mimeType = (attachment.mimeType || parsed.mimeType).replace(/\s+/g, "");
  if (attachment.type === "audio" && !isSupportedWhatsAppAudio(mimeType)) {
    throw new Error("UNSUPPORTED_AUDIO_FORMAT");
  }

  const formData = new FormData();
  formData.set("messaging_product", "whatsapp");
  formData.set("type", mimeType);
  formData.set("file", new Blob([new Uint8Array(parsed.buffer)], { type: mimeType }), attachment.name);

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error?.message || "MEDIA_UPLOAD_FAILED");
  }

  return {
    id: payload.id as string,
    mimeType
  };
}

function getInstagramReplyMessageId(messageId?: string) {
  if (!messageId) return "";
  if (messageId.startsWith("ig-out-")) return messageId.slice("ig-out-".length);
  if (messageId.startsWith("ig-")) return messageId.slice("ig-".length);
  return "";
}

function getTelegramReplyMessageId(messageId?: string) {
  if (!messageId) return undefined;
  const value = messageId.startsWith("tg-out-") ? messageId.slice("tg-out-".length) : messageId.startsWith("tg-") ? messageId.slice("tg-".length) : messageId;
  const numericId = Number(value.split("-").at(-1));
  return Number.isFinite(numericId) ? numericId : undefined;
}

async function sendInstagramTextMessage(instagramAccountId: string, accessToken: string, recipientId: string, text: string, replyToMessageId?: string) {
  const replyTo = getInstagramReplyMessageId(replyToMessageId);
  const buildPayload = (includeReplyTo: boolean) => ({
    recipient: {
      id: recipientId
    },
    message: {
      text
    },
    ...(includeReplyTo && replyTo ? { reply_to: { mid: replyTo } } : {})
  });

  const send = (includeReplyTo: boolean) => fetch(`https://graph.instagram.com/v22.0/${instagramAccountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildPayload(includeReplyTo))
  });

  let response = await send(Boolean(replyTo));
  let payload = await response.json().catch(() => null);

  if (!response.ok && replyTo && String(payload?.error?.message || "").toLowerCase().includes("invalid parameter")) {
    console.error("Instagram reply_to rejected; retrying as plain message", {
      status: response.status,
      error: payload?.error,
      instagramAccountId,
      recipientId,
      replyTo
    });
    response = await send(false);
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    console.error("Instagram message send failed", {
      status: response.status,
      error: payload?.error,
      instagramAccountId,
      recipientId
    });
    throw new MetaSendError(payload?.error?.message || "تعذر إرسال الرسالة عبر Instagram", response.status);
  }

  return payload as { message_id?: string; recipient_id?: string };
}

async function sendInstagramCommentReply(commentId: string, accessToken: string, text: string) {
  const cleanCommentId = commentId.replace(/^ig-/, "").trim();
  const response = await fetch(`https://graph.instagram.com/v22.0/${cleanCommentId}/replies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: text
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Instagram comment reply failed", {
      status: response.status,
      error: payload?.error,
      commentId: cleanCommentId
    });
    throw new MetaSendError(payload?.error?.message || "تعذر الرد على تعليق Instagram", response.status);
  }

  return payload as { id?: string };
}

async function sendFacebookTextMessage(pageAccessToken: string, recipientId: string, text: string) {
  const response = await fetch("https://graph.facebook.com/v22.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text }
    })
  });
  const payload = await response.json().catch(() => null) as {
    message_id?: string;
    recipient_id?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    console.error("Facebook message send failed", {
      status: response.status,
      error: payload?.error,
      recipientId
    });
    throw new MetaSendError(payload?.error?.message || "تعذر إرسال الرسالة عبر Facebook", response.status);
  }

  return payload;
}

async function sendTelegramTextMessage(botToken: string, chatId: string, text: string, replyToMessageId?: string) {
  const replyTo = getTelegramReplyMessageId(replyToMessageId);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {})
    })
  });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    console.error("Telegram message send failed", {
      status: response.status,
      description: payload?.description,
      chatId
    });
    throw new MetaSendError(payload?.description || "تعذر إرسال الرسالة عبر Telegram", response.status);
  }

  return payload.result;
}

async function isWhatsAppReplyWindowExpired(conversationId: string, fallbackExpired: boolean) {
  const lastCustomerMessage = await prisma.message.findFirst({
    where: {
      conversationId,
      direction: "in",
      createdAt: {
        not: ""
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!lastCustomerMessage?.createdAt) return fallbackExpired;

  const lastCustomerMessageAt = new Date(lastCustomerMessage.createdAt).getTime();
  if (Number.isNaN(lastCustomerMessageAt)) return fallbackExpired;

  return Date.now() - lastCustomerMessageAt >= 24 * 60 * 60 * 1000;
}

async function findOrCreateConversation(id: string, tenantId: string, snapshot?: ConversationSnapshot) {
  const existing = await prisma.conversation.findFirst({
    where: { id, tenantId },
    include: { customer: true }
  });

  if (existing) return existing;

  const phone = normalizeWhatsAppPhone(snapshot?.phone ?? getPhoneFromConversationId(id));
  if (!phone) return null;

  const existingCustomer = await prisma.customer.findFirst({ where: { phone, tenantId } });

  if (existingCustomer) {
    const byCustomerPhone = await prisma.conversation.findFirst({
      where: { customerId: existingCustomer.id, tenantId },
      include: { customer: true }
    });

    if (byCustomerPhone) return byCustomerPhone;
  }

  const customerName = snapshot?.customer?.trim() || `عميل ${phone.slice(-4) || "واتساب"}`;
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const customerId = existingCustomer?.id ?? `${scopedPrefix}wa-${phone}`;
  const conversationId = `${scopedPrefix}${id || snapshot?.id?.trim() || `conv-${phone}`}`;
  const initial = getFallbackInitial(customerName, phone, snapshot?.initial);
  const assignee = snapshot?.assignee?.trim() || "بدون موظف";
  const status = normalizeConversationStatus(snapshot?.status);

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { name: customerName, phone, initial },
      create: { id: customerId, name: customerName, phone, initial, tenantId }
    });

    return tx.conversation.upsert({
      where: { id: conversationId },
      update: { customerId, assignee, status },
      create: {
        id: conversationId,
        customerId,
        channel: "whatsapp",
        lastMessage: "",
        status,
        assignee,
        unread: 0,
        windowExpired: 0,
        tenantId
      },
      include: { customer: true }
    });
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const body = (await request.json()) as {
    direction?: string;
    text?: string;
    forceWindowExpired?: boolean;
    messageType?: "text" | "template";
    templateName?: string;
    templateLanguage?: string;
    attachment?: AttachmentPayload;
    conversation?: ConversationSnapshot;
    replyToCommentId?: string;
    replyToMessageId?: string;
  };
  const attachment = body.attachment?.type && body.attachment.name && body.attachment.dataUrl
    ? body.attachment as AttachmentPayload & Required<Pick<AttachmentPayload, "type" | "name" | "dataUrl">>
    : undefined;
  const text = body.text?.trim() || (attachment?.type === "image" ? "صورة" : attachment?.type === "audio" ? "تسجيل صوتي" : attachment?.type === "document" ? "مستند" : "");
  const direction = body.direction === "note" ? "note" : "out";

  if (!text) return jsonError("نص الرسالة مطلوب");
  if (text.length > 4_000) return jsonError("نص الرسالة يتجاوز الحد المسموح");
  if (attachment) {
    if (attachment.name.length > 180 || attachment.dataUrl.length > 12 * 1024 * 1024) return jsonError("المرفق أكبر من الحد المسموح");
    const parsedAttachment = parseDataUrl(attachment.dataUrl);
    if (!parsedAttachment || parsedAttachment.buffer.length > 8 * 1024 * 1024) return jsonError("المرفق غير صالح أو أكبر من 8 ميجابايت");
    const mimeType = getBaseMimeType(attachment.mimeType || parsedAttachment.mimeType);
    const allowedMimeTypes = attachment.type === "image"
      ? ["image/jpeg", "image/png", "image/webp"]
      : attachment.type === "audio"
        ? ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg", "audio/webm", "audio/wav", "audio/x-wav"]
        : ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedMimeTypes.includes(mimeType)) return jsonError("نوع المرفق غير مدعوم");
  }

  const conversation = await findOrCreateConversation(id, user.tenantId, body.conversation);

  if (!conversation) return jsonError("المحادثة غير موجودة", 404);

  try {
    const now = new Date();
    const sentAt = now.toISOString();
    const messageTime = formatMessageTime(now);
    const replyToMessage = body.replyToMessageId
      ? await prisma.message.findFirst({
          where: {
            id: body.replyToMessageId,
            conversation: { tenantId: user.tenantId }
          }
        })
      : null;
    const replyToData = replyToMessage
      ? {
          replyToMessageId: replyToMessage.id,
          replyToText: (replyToMessage.text || "رسالة").slice(0, 220),
          replyToAuthor: replyToMessage.direction === "out"
            ? replyToMessage.author || user?.name || "أنت"
            : conversation.customer.name
        }
      : {
          replyToMessageId: "",
          replyToText: "",
          replyToAuthor: ""
        };

    if (direction === "note") {
      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "tiktok") {
      return jsonError("إرسال رسائل TikTok غير مفعل بعد - بانتظار موافقة TikTok على صلاحية Business Messaging لحسابك.", 400);
    }

    if (conversation.channel === "sms") {
      if (attachment) return jsonError("إرسال المرفقات عبر SMS غير مدعوم، جرّب إرسال نص فقط.", 400);

      const smsSettings = await getIntegrationSettings("sms", user?.tenantId);
      const appSid = smsSettings.appId?.trim();
      const senderId = smsSettings.phoneNumber?.trim();
      const to = conversation.customer.phone?.trim();

      if (!appSid || !senderId) return jsonError("أكمل بيانات Unifonic (AppSid واسم المرسل) من صفحة الإعدادات قبل الإرسال");
      if (!to) return jsonError("رقم جوال العميل غير موجود في ملف المحادثة");

      try {
        await sendUnifonicSms({ appSid, senderId, to, text });
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : "تعذر إرسال الرسالة عبر Unifonic", 502);
      }

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "website") {
      if (attachment) return jsonError("إرسال المرفقات عبر ودجت الموقع غير مفعل حالياً، جرّب إرسال نص فقط.", 400);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "google_maps") {
      if (attachment) return jsonError("إرسال المرفقات في خرائط Google غير مفعل، اكتب رد نصي على التقييم.", 400);

      const googleSettings = await getIntegrationSettings("google_maps", user?.tenantId);
      const reviewMessage = replyToMessage?.sourceType === "google_review"
        ? replyToMessage
        : await prisma.message.findFirst({
            where: {
              conversationId: conversation.id,
              sourceType: "google_review",
              sourceId: { not: "" }
            },
            orderBy: { createdAt: "desc" }
          });
      const reviewId = reviewMessage?.sourceId || conversation.customer.phone;

      if (!googleSettings.accessToken.trim() || !googleSettings.googleLocationId.trim()) {
        return jsonError("ربط خرائط Google غير مكتمل قبل الرد على التقييم");
      }
      if (!reviewId?.trim()) {
        return jsonError("معرف تقييم Google غير موجود في هذه المحادثة");
      }

      await replyToGoogleReview(googleSettings, reviewId, text);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: `gm-out-${reviewId}-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData,
            sourceType: "google_review_reply",
            sourceId: reviewId,
            sourceUrl: reviewMessage?.sourceUrl || "",
            sourceLabel: reviewMessage?.sourceLabel || "رد على تقييم Google"
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "telegram") {
      if (attachment) return jsonError("إرسال المرفقات في Telegram غير مفعل حالياً، جرّب إرسال نص فقط.", 400);

      const telegramSettings = await getIntegrationSettings("telegram", user?.tenantId);
      const botToken = telegramSettings.accessToken?.trim();
      const chatId = conversation.customer.phone?.trim();

      if (!botToken) return jsonError("Bot Token مطلوب قبل إرسال الرسالة عبر Telegram");
      if (!chatId) return jsonError("معرّف محادثة Telegram غير موجود في ملف المحادثة");

      const telegramResponse = await sendTelegramTextMessage(botToken, chatId, text, replyToMessage?.id);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: telegramResponse?.message_id ? `tg-out-${chatId}-${telegramResponse.message_id}` : `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "x") {
      if (attachment) return jsonError("إرسال المرفقات في X غير مفعل حالياً، جرّب إرسال نص فقط.", 400);

      const xSettings = await getIntegrationSettings("x", user?.tenantId);
      const recipientId = conversation.customer.phone?.trim();

      if (!recipientId) return jsonError("معرّف عميل X غير موجود في ملف المحادثة");
      if (recipientId === xSettings.wabaId?.trim() || recipientId === xSettings.phoneNumber?.replace(/^@/, "").trim()) {
        return jsonError("هذه محادثة حساب X المرتبط نفسه وليست عميلاً. اختر محادثة عميل أخرى من القائمة.", 400);
      }

      const xResponse = await sendXDirectMessage(xSettings, recipientId, text);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: xResponse?.dm_event_id ? `x-out-${xResponse.dm_event_id}` : `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData,
            sourceType: "x_dm",
            sourceId: xResponse?.dm_conversation_id || ""
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "email") {
      if (attachment) return jsonError("إرسال المرفقات عبر البريد غير مفعل حالياً، جرّب إرسال نص فقط.", 400);

      const recipientEmail = conversation.customer.phone?.trim();
      const latestEmailMessage = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          sourceType: "email"
        },
        orderBy: { createdAt: "desc" }
      });

      if (!recipientEmail) return jsonError("بريد العميل غير موجود في ملف المحادثة");

      const subject = latestEmailMessage?.sourceLabel
        ? `Re: ${latestEmailMessage.sourceLabel}`
        : "رد من Linkly";
      await sendEmailMessage(recipientEmail, text, subject, user?.tenantId);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData,
            sourceType: "email_reply",
            sourceId: "",
            sourceLabel: latestEmailMessage?.sourceLabel || "رد بريد إلكتروني"
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "facebook") {
      if (attachment) return jsonError("إرسال المرفقات في Facebook غير مفعل حالياً، جرّب إرسال نص فقط.", 400);

      const facebookSettings = await getIntegrationSettings("facebook", user?.tenantId);
      const pageAccessToken = facebookSettings.accessToken?.trim();
      const recipientId = conversation.customer.phone?.trim();

      if (!pageAccessToken) return jsonError("Page Access Token مطلوب قبل إرسال الرسالة عبر Facebook");
      if (!recipientId) return jsonError("معرّف عميل Facebook غير موجود في ملف المحادثة");
      if (recipientId === facebookSettings.wabaId?.trim()) {
        return jsonError("هذه محادثة صفحة Facebook المرتبطة نفسها وليست عميلاً. اختر محادثة عميل أخرى من القائمة.", 400);
      }

      const metaResponse = await sendFacebookTextMessage(pageAccessToken, recipientId, text);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: metaResponse?.message_id ? `fb-out-${metaResponse.message_id}` : `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    if (conversation.channel === "instagram") {
      if (attachment) return jsonError("إرسال المرفقات في Instagram غير مفعل حالياً، جرّب إرسال نص فقط.", 400);

      const instagramSettings = await getIntegrationSettings("instagram", user?.tenantId);
      const instagramAccountId = instagramSettings.wabaId?.trim();
      const instagramAccessToken = instagramSettings.accessToken?.trim();
      const recipientId = conversation.customer.phone?.trim();

      if (!instagramAccessToken) return jsonError("Access Token مطلوب قبل إرسال الرسالة عبر Instagram");

      if (body.replyToCommentId) {
        const replyToCommentId = body.replyToCommentId;
        const cleanReplyToCommentId = replyToCommentId.replace(/^ig-/, "");
        const metaResponse = await sendInstagramCommentReply(replyToCommentId, instagramAccessToken, text);

        const message = await prisma.$transaction(async (tx) => {
          const sourceMessage = await tx.message.findUnique({
            where: { id: replyToCommentId }
          });
          const created = await tx.message.create({
            data: {
              id: metaResponse?.id ? `ig-comment-reply-${metaResponse.id}` : `m-${Date.now()}`,
              conversationId: conversation.id,
              direction,
              text: `رد على التعليق: ${text}`,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData,
            sourceType: sourceMessage?.sourceType || "instagram_comment",
              sourceId: sourceMessage?.sourceId || cleanReplyToCommentId,
              sourceUrl: sourceMessage?.sourceUrl || "",
              sourceLabel: sourceMessage?.sourceLabel || "التعليق المرتبط"
            }
          });

          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessage: text,
              lastActivityAt: sentAt
            }
          });

          return created;
        });

        return jsonOk(message);
      }

      if (!instagramAccountId) return jsonError("Instagram Account ID مطلوب قبل إرسال الرسالة");
      if (!recipientId) return jsonError("معرّف عميل Instagram غير موجود في ملف المحادثة");
      if (recipientId === instagramAccountId) {
        return jsonError("هذه محادثة حساب Instagram المرتبط نفسه وليست عميلاً. اختر محادثة عميل أخرى من القائمة.", 400);
      }

      const metaResponse = await sendInstagramTextMessage(instagramAccountId, instagramAccessToken, recipientId, text, replyToMessage?.id);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: metaResponse?.message_id ? `ig-out-${metaResponse.message_id}` : `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            createdAt: sentAt,
            author: user?.name ?? "",
            ...replyToData
          }
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: text,
            lastActivityAt: sentAt
          }
        });

        return created;
      });

      return jsonOk(message);
    }

    const settings = await getIntegrationSettings("whatsapp", user?.tenantId);
    const phoneNumberId = settings.phoneNumberId?.trim();
    const accessToken = settings.accessToken?.trim();
    const to = normalizeWhatsAppPhone(conversation.customer.phone);
    const isTemplateMessage = body.messageType === "template" || Boolean(body.templateName);
    const isAttachmentMessage = Boolean(attachment);
    const isReplyWindowExpired = await isWhatsAppReplyWindowExpired(conversation.id, Boolean(conversation.windowExpired));

    if (!phoneNumberId) return jsonError("Phone Number ID مطلوب قبل إرسال الرسالة");
    if (!accessToken) return jsonError("Access Token مطلوب قبل إرسال الرسالة");
    if (!to) return jsonError("رقم العميل غير موجود في ملف المحادثة");
    if (isReplyWindowExpired && !isTemplateMessage) {
      return jsonError("انتهت نافذة الرد خلال 24 ساعة. استخدم قالب WhatsApp معتمد لإعادة فتح المحادثة.");
    }

    const templateName = body.templateName?.trim();
    if (isTemplateMessage && !templateName) {
      return jsonError("اسم قالب WhatsApp مطلوب قبل الإرسال");
    }

    let uploadedMedia: { id: string; mimeType: string } | null = null;
    const normalizedAttachment = attachment ? await normalizeAudioAttachment(attachment) : undefined;
    if (attachment) {
      uploadedMedia = await uploadWhatsAppMedia(phoneNumberId, accessToken, {
        type: normalizedAttachment?.type as "image" | "audio" | "document",
        name: normalizedAttachment?.name as string,
        dataUrl: normalizedAttachment?.dataUrl as string,
        mimeType: normalizedAttachment?.mimeType
      });
    }

    const whatsappContextMessageId = getWhatsAppContextMessageId(replyToMessage?.id);
    const whatsappContext = whatsappContextMessageId ? { context: { message_id: whatsappContextMessageId } } : {};

    const payload = isAttachmentMessage && uploadedMedia
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: attachment?.type,
          ...whatsappContext,
          [attachment?.type === "image" ? "image" : attachment?.type === "document" ? "document" : "audio"]: {
            id: uploadedMedia.id,
            ...(attachment?.type === "document" ? { filename: normalizedAttachment?.name || attachment.name } : {}),
            ...((attachment?.type === "image" || attachment?.type === "document") && body.text?.trim() ? { caption: body.text.trim() } : {})
          }
        }
      : isTemplateMessage
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          ...whatsappContext,
          template: {
            name: templateName,
            language: {
              code: normalizeTemplateLanguage(body.templateLanguage)
            }
          }
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          ...whatsappContext,
          text: {
            preview_url: false,
            body: text
          }
        };

    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const metaResponse = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("WhatsApp message send failed", {
        status: response.status,
        error: metaResponse?.error,
        messageType: payload.type,
        attachmentType: attachment?.type,
        attachmentMime: uploadedMedia?.mimeType
      });
      return jsonError(metaResponse?.error?.message || "تعذر إرسال الرسالة عبر WhatsApp", response.status);
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          id: metaResponse?.messages?.[0]?.id ? `wa-out-${metaResponse.messages[0].id}` : `m-${Date.now()}`,
          conversationId: conversation.id,
          direction,
          text,
          time: messageTime,
          createdAt: sentAt,
          author: user?.name ?? ""
          ,
          ...replyToData,
          attachmentType: attachment?.type ?? "",
          attachmentUrl: normalizedAttachment?.dataUrl ?? "",
          attachmentName: normalizedAttachment?.name ?? "",
          attachmentMime: uploadedMedia?.mimeType ?? normalizedAttachment?.mimeType ?? "",
          metaMediaId: uploadedMedia?.id ?? ""
        }
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: text,
          windowExpired: body.forceWindowExpired ? 1 : undefined,
          lastActivityAt: sentAt
        }
      });

      return created;
    });

    return jsonOk(message);
  } catch (error) {
    console.error("Conversation message send failed", error);
    if (error instanceof Error && error.message === "INVALID_ATTACHMENT") {
      return jsonError("ملف المرفق غير صالح", 400);
    }
    if (error instanceof Error && error.message === "ATTACHMENT_TOO_LARGE") {
      return jsonError("حجم المرفق كبير، الحد الأقصى 8 ميجا", 400);
    }
    if (error instanceof Error && error.message === "UNSUPPORTED_AUDIO_FORMAT") {
      return jsonError("صيغة التسجيل الصوتي غير مدعومة في واتساب. جرّب التسجيل من متصفح يدعم audio/ogg أو audio/mp4.", 400);
    }
    if (error instanceof Error && error.message === "AUDIO_CONVERSION_FAILED") {
      return jsonError("تعذر تجهيز التسجيل الصوتي للإرسال عبر واتساب. جرّب تسجيل جديد.", 500);
    }
    if (error instanceof MetaSendError) {
      if (error.message.toLowerCase().includes("access token") || error.message.toLowerCase().includes("session has expired")) {
        return jsonError("انتهت صلاحية ربط Instagram. أعد ربط Instagram من صفحة الإعدادات والربط ثم جرّب الإرسال من جديد.", 401);
      }
      return jsonError(error.message, error.status);
    }
    if (error instanceof XApiError) {
      if (error.status === 401) {
        return jsonError("انتهت صلاحية ربط X. أعد ربط X من صفحة الإعدادات والربط ثم جرّب الإرسال من جديد.", 401);
      }
      return jsonError(error.message, error.status);
    }
    if (error instanceof Error && conversation.channel === "email") {
      return jsonError(`تعذر إرسال البريد الإلكتروني: ${error.message}`, 400);
    }
    return jsonError("تعذر إرسال الرسالة", 500);
  }
}
