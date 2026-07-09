import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { convertAudioToMp3 } from "../../../../../lib/audio-conversion";
import { getIntegrationSettings } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { formatMessageTime } from "../../../../../lib/time";
import { normalizeWhatsAppPhone } from "../../../../../lib/whatsapp-inbox";
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

function getConvertedAudioName(fileName?: string) {
  return `${fileName?.replace(/\.[^.]+$/, "") || `voice-${Date.now()}`}.mp3`;
}

async function normalizeAudioAttachment(attachment: AttachmentPayload) {
  if (attachment.type !== "audio") return attachment;

  const parsed = parseDataUrl(attachment.dataUrl);
  if (!parsed) throw new Error("INVALID_ATTACHMENT");

  const mimeType = (attachment.mimeType || parsed.mimeType).replace(/\s+/g, "");
  if (!isSupportedWhatsAppAudio(mimeType)) {
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

async function findOrCreateConversation(id: string, snapshot?: ConversationSnapshot) {
  const existing = await prisma.conversation.findUnique({
    where: { id },
    include: { customer: true }
  });

  if (existing) return existing;

  const phone = normalizeWhatsAppPhone(snapshot?.phone ?? getPhoneFromConversationId(id));
  if (!phone) return null;

  const existingCustomer = await prisma.customer.findFirst({ where: { phone } });

  if (existingCustomer) {
    const byCustomerPhone = await prisma.conversation.findFirst({
      where: { customerId: existingCustomer.id },
      include: { customer: true }
    });

    if (byCustomerPhone) return byCustomerPhone;
  }

  const customerName = snapshot?.customer?.trim() || `عميل ${phone.slice(-4) || "واتساب"}`;
  const customerId = existingCustomer?.id ?? `wa-${phone}`;
  const conversationId = id || snapshot?.id?.trim() || `conv-${phone}`;
  const initial = getFallbackInitial(customerName, phone, snapshot?.initial);
  const assignee = snapshot?.assignee?.trim() || "بدون موظف";
  const status = normalizeConversationStatus(snapshot?.status);

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { name: customerName, phone, initial },
      create: { id: customerId, name: customerName, phone, initial }
    });

    return tx.conversation.upsert({
      where: { id: conversationId },
      update: { customerId, assignee, status },
      create: {
        id: conversationId,
        customerId,
        lastMessage: "",
        status,
        assignee,
        unread: 0,
        windowExpired: 0
      },
      include: { customer: true }
    });
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  const body = (await request.json()) as {
    direction?: string;
    text?: string;
    forceWindowExpired?: boolean;
    messageType?: "text" | "template";
    templateName?: string;
    templateLanguage?: string;
    attachment?: AttachmentPayload;
    conversation?: ConversationSnapshot;
  };
  const attachment = body.attachment?.type && body.attachment.name && body.attachment.dataUrl ? body.attachment : undefined;
  const text = body.text?.trim() || (attachment?.type === "image" ? "صورة" : attachment?.type === "audio" ? "تسجيل صوتي" : attachment?.type === "document" ? "مستند" : "");
  const direction = body.direction || "out";

  if (!text) return jsonError("نص الرسالة مطلوب");

  const conversation = await findOrCreateConversation(id, body.conversation);

  if (!conversation) return jsonError("المحادثة غير موجودة", 404);

  try {
    const now = new Date();
    const sentAt = now.toISOString();
    const messageTime = formatMessageTime(now);

    if (direction === "note") {
      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: `m-${Date.now()}`,
            conversationId: conversation.id,
            direction,
            text,
            time: messageTime,
            author: user?.name ?? ""
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

    const settings = await getIntegrationSettings();
    const phoneNumberId = settings.phoneNumberId?.trim();
    const accessToken = settings.accessToken?.trim();
    const to = normalizeWhatsAppPhone(conversation.customer.phone);
    const isTemplateMessage = body.messageType === "template" || Boolean(body.templateName);
    const isAttachmentMessage = Boolean(attachment);

    if (!phoneNumberId) return jsonError("Phone Number ID مطلوب قبل إرسال الرسالة");
    if (!accessToken) return jsonError("Access Token مطلوب قبل إرسال الرسالة");
    if (!to) return jsonError("رقم العميل غير موجود في ملف المحادثة");
    if (conversation.windowExpired && !isTemplateMessage) {
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

    const payload = isAttachmentMessage && uploadedMedia
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: attachment?.type,
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
          author: user?.name ?? ""
          ,
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
    return jsonError("تعذر إرسال الرسالة", 500);
  }
}
