import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";
import { shouldStartConversationClosed } from "./bot-engine";
import { maybeRecordRatingReply, sendRatingThanks } from "./conversation-rating";

type StoreWhatsAppMessageInput = {
  phone: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  tenantId?: string;
  messageId?: string;
  author?: string;
  receivedAt?: Date;
  attachment?: {
    type: "image" | "audio" | "sticker" | "document";
    url: string;
    name: string;
    mimeType?: string;
    metaMediaId?: string;
  };
  replyToMessageId?: string;
};

export function normalizeWhatsAppPhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function getCustomerName(phone: string, name?: string) {
  const cleanName = name?.trim();
  return cleanName || `عميل ${phone.slice(-4) || "واتساب"}`;
}

function getCustomerInitial(name: string, phone: string) {
  return name.trim().charAt(0) || phone.slice(-1) || "ع";
}

// The WhatsApp CTA on the marketing site appends an invisible marker to the
// pre-filled click-to-chat text (see app/WhatsAppCta.tsx) so the customer's
// first message carries which LinkClick it came from, without the marker
// being visible in their message. Strip it out before the text is ever
// stored/displayed, and hand back the click id so the caller can attribute
// the new conversation to it.
const attributionMarkerPattern = /\n?​?\[REF:([A-Za-z0-9_-]+)\]\s*$/;

function extractAttributionMarker(text: string): { cleanText: string; linkClickId: string | null } {
  const match = text.match(attributionMarkerPattern);
  if (!match) return { cleanText: text, linkClickId: null };
  return { cleanText: text.slice(0, match.index).trimEnd(), linkClickId: match[1] };
}

export async function storeWhatsAppMessage(input: StoreWhatsAppMessageInput) {
  await ensureSchema();

  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const phone = normalizeWhatsAppPhone(input.phone);
  const tenantId = input.tenantId || "tenant-demo";
  const name = getCustomerName(phone, input.name);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const customerId = `${scopedPrefix}wa-${phone}`;
  const conversationId = `${scopedPrefix}conv-${phone}`;
  const messageId = input.messageId ? `wa-${input.messageId}` : `wa-${input.direction}-${phone}-${Date.now()}`;
  const startClosed = await shouldStartConversationClosed(tenantId, "whatsapp");
  const { cleanText, linkClickId } = input.direction === "in" ? extractAttributionMarker(input.text) : { cleanText: input.text, linkClickId: null };
  const linkClick = linkClickId ? await prisma.linkClick.findUnique({ where: { id: linkClickId } }) : null;
  const ratingRecorded = input.direction === "in" ? await maybeRecordRatingReply(conversationId, cleanText) : false;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name,
        phone,
        initial: getCustomerInitial(name, phone),
        tenantId
      },
      create: {
        id: customerId,
        name,
        phone,
        initial: getCustomerInitial(name, phone),
        tenantId
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        channel: "whatsapp",
        lastMessage: cleanText,
        status: startClosed ? "closed" : "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt,
        tenantId,
        // Only takes effect if this is a genuinely new row - upsert()
        // ignores `create` entirely when the conversation already exists,
        // so a phone's second-ever message can never overwrite attribution
        // recorded on its first.
        attrPageId: linkClick?.pageId ?? "",
        attrLinkId: linkClick?.linkId ?? "",
        attrReferrer: linkClick?.referrer ?? "",
        attrUtmSource: linkClick?.utmSource ?? "",
        attrUtmMedium: linkClick?.utmMedium ?? "",
        attrUtmCampaign: linkClick?.utmCampaign ?? "",
        attrUtmContent: linkClick?.utmContent ?? ""
      }
    });

    // Meta retries webhook delivery whenever our response is slow (e.g. a
    // cold serverless start), so the same inbound message can arrive more
    // than once. The message id is stable across retries, so treat an
    // already-stored message as a duplicate delivery and skip re-running
    // side effects (bot flow, automations, unread count) a second time.
    const existingMessage = await tx.message.findUnique({ where: { id: messageId } });
    if (existingMessage) {
      return { conversationId, message: existingMessage, isNew: false };
    }

    if (input.direction === "in" && !ratingRecorded) {
      await restartBotFlowIfClosed(tx, conversationId);
    }

    const replyToMessage = input.replyToMessageId
      ? await tx.message.findFirst({
          where: {
            OR: [
              { id: `wa-${input.replyToMessageId}` },
              { id: `wa-out-${input.replyToMessageId}` },
              { id: input.replyToMessageId }
            ]
          }
        })
      : null;

    const message = await tx.message.upsert({
      where: { id: messageId },
      update: {},
      create: {
        id: messageId,
        conversationId,
        direction: input.direction,
        text: cleanText,
        time: formatMessageTime(input.receivedAt ?? new Date()),
        createdAt: activityAt,
        author: input.author || "",
        attachmentType: input.attachment?.type ?? "",
        attachmentUrl: input.attachment?.url ?? "",
        attachmentName: input.attachment?.name ?? "",
        attachmentMime: input.attachment?.mimeType ?? "",
        metaMediaId: input.attachment?.metaMediaId ?? "",
        replyToMessageId: replyToMessage?.id ?? (input.replyToMessageId ? `wa-${input.replyToMessageId}` : ""),
        replyToText: replyToMessage?.text ?? "",
        replyToAuthor: replyToMessage
          ? replyToMessage.direction === "out"
            ? replyToMessage.author || "أنت"
            : name
          : ""
      }
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessage: cleanText,
        unread: input.direction === "in" ? { increment: 1 } : undefined,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    return {
      conversationId,
      message,
      isNew: true
    };
  }).then(async (result) => {
    if (input.direction === "in" && result.isNew) {
      await runInboundMessageAutomations(result.conversationId, tenantId, cleanText);
      if (linkClick && !linkClick.matchedConversationId) {
        await prisma.linkClick.update({
          where: { id: linkClick.id },
          data: { matchedConversationId: result.conversationId }
        }).catch(() => {
          // Best-effort bookkeeping only - never fail message storage over it.
        });
      }
    }
    if (ratingRecorded) {
      await sendRatingThanks(result.conversationId);
    }
    return result;
  });
}
