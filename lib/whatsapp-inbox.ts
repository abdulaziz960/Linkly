import { prisma } from "./prisma";
import { formatMessageTime } from "./time";

type StoreWhatsAppMessageInput = {
  phone: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  messageId?: string;
  author?: string;
  receivedAt?: Date;
  attachment?: {
    type: "image" | "audio";
    url: string;
    name: string;
    mimeType?: string;
    metaMediaId?: string;
  };
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
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const phone = normalizeWhatsAppPhone(input.phone);
  const name = getCustomerName(phone, input.name);
  const customerId = `wa-${phone}`;
  const conversationId = `conv-${phone}`;
  const messageId = input.messageId ? `wa-${input.messageId}` : `wa-${input.direction}-${phone}-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name,
        phone,
        initial: getCustomerInitial(name, phone)
      },
      create: {
        id: customerId,
        name,
        phone,
        initial: getCustomerInitial(name, phone)
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        lastMessage: input.text,
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    const message = await tx.message.upsert({
      where: { id: messageId },
      update: {},
      create: {
        id: messageId,
        conversationId,
        direction: input.direction,
        text: input.text,
        time: formatMessageTime(),
        author: input.author || "",
        attachmentType: input.attachment?.type ?? "",
        attachmentUrl: input.attachment?.url ?? "",
        attachmentName: input.attachment?.name ?? "",
        attachmentMime: input.attachment?.mimeType ?? "",
        metaMediaId: input.attachment?.metaMediaId ?? ""
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
  });
}
