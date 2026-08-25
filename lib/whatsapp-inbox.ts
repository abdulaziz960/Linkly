import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { reopenConversationIfClosed } from "./conversation-lifecycle";

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
        lastMessage: input.text,
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt,
        tenantId
      }
    });

    if (input.direction === "in") {
      await reopenConversationIfClosed(tx, conversationId);
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
        text: input.text,
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
        lastMessage: input.text,
        unread: input.direction === "in" ? { increment: 1 } : undefined,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    return {
      conversationId,
      message
    };
  }).then(async (result) => {
    if (input.direction === "in") {
      await runInboundMessageAutomations(result.conversationId, tenantId, input.text);
    }
    return result;
  });
}
