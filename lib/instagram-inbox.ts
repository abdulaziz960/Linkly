import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";

type StoreInstagramMessageInput = {
  instagramUserId: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  tenantId?: string;
  messageId?: string;
  author?: string;
  receivedAt?: Date;
  replyToMessageId?: string;
  source?: {
    type: string;
    id?: string;
    url?: string;
    label?: string;
  };
};

function getCustomerName(instagramUserId: string, name?: string) {
  const cleanName = name?.trim();
  return cleanName || `Instagram ${instagramUserId.slice(-4) || "عميل"}`;
}

function isFallbackInstagramName(name: string, instagramUserId: string) {
  return name === getCustomerName(instagramUserId);
}

function getCustomerInitial(name: string, instagramUserId: string) {
  return name.trim().charAt(0) || instagramUserId.slice(-1) || "I";
}

export async function storeInstagramMessage(input: StoreInstagramMessageInput) {
  await ensureSchema();

  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const instagramUserId = input.instagramUserId.replace(/\s+/g, "");
  const tenantId = input.tenantId || "tenant-demo";
  const name = getCustomerName(instagramUserId, input.name);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const customerId = `${scopedPrefix}ig-${instagramUserId}`;
  const conversationId = `${scopedPrefix}ig-${instagramUserId}`;
  const messageId = input.messageId ? `ig-${input.messageId}` : `ig-${input.direction}-${instagramUserId}-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    const existingCustomer = await tx.customer.findUnique({
      where: { id: customerId }
    });
    const shouldUpdateName = Boolean(input.name?.trim()) || !existingCustomer || isFallbackInstagramName(existingCustomer.name, instagramUserId);
    const customerName = shouldUpdateName ? name : existingCustomer.name;

    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name: customerName,
        phone: instagramUserId,
        initial: getCustomerInitial(customerName, instagramUserId),
        tenantId
      },
      create: {
        id: customerId,
        name: customerName,
        phone: instagramUserId,
        initial: getCustomerInitial(customerName, instagramUserId),
        tenantId
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        channel: "instagram",
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
      await restartBotFlowIfClosed(tx, conversationId);
    }

    const replyToMessage = input.replyToMessageId
      ? await tx.message.findFirst({
          where: {
            OR: [
              { id: `ig-${input.replyToMessageId}` },
              { id: `ig-out-${input.replyToMessageId}` },
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
        sourceType: input.source?.type || "",
        sourceId: input.source?.id || "",
        sourceUrl: input.source?.url || "",
        sourceLabel: input.source?.label || "",
        replyToMessageId: replyToMessage?.id ?? (input.replyToMessageId ? `ig-${input.replyToMessageId}` : ""),
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
