import crypto from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";
import { shouldStartConversationClosed } from "./bot-engine";

type StoreTelegramMessageInput = {
  tenantId?: string;
  chatId: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  messageId?: string;
  author?: string;
  receivedAt?: Date;
  replyToMessageId?: string;
};

function scopedId(tenantId: string, chatId: string) {
  if (tenantId === "tenant-demo") return `tg-${chatId}`;
  return `tg-${crypto.createHash("sha256").update(`${tenantId}:${chatId}`).digest("hex").slice(0, 24)}`;
}

function getCustomerName(chatId: string, name?: string) {
  const cleanName = name?.trim();
  return cleanName || `Telegram ${chatId.slice(-4) || "عميل"}`;
}

function getCustomerInitial(name: string, chatId: string) {
  return name.trim().charAt(0) || chatId.slice(-1) || "T";
}

export async function storeTelegramMessage(input: StoreTelegramMessageInput) {
  await ensureSchema();

  const tenantId = input.tenantId || "tenant-demo";
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const chatId = input.chatId.replace(/\s+/g, "");
  const name = getCustomerName(chatId, input.name);
  const customerId = scopedId(tenantId, chatId);
  const conversationId = scopedId(tenantId, chatId);
  const messageId = input.messageId ? `tg-${input.messageId}` : `tg-${input.direction}-${chatId}-${Date.now()}`;
  const startClosed = await shouldStartConversationClosed(tenantId, "telegram");

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name,
        phone: chatId,
        initial: getCustomerInitial(name, chatId)
      },
      create: {
        id: customerId,
        tenantId,
        name,
        phone: chatId,
        initial: getCustomerInitial(name, chatId)
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        tenantId,
        customerId,
        channel: "telegram",
        lastMessage: input.text,
        status: startClosed ? "closed" : "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    if (input.direction === "in") {
      await restartBotFlowIfClosed(tx, conversationId);
    }

    const replyToMessage = input.replyToMessageId
      ? await tx.message.findFirst({
          where: {
            OR: [
              { id: `tg-${input.chatId}-${input.replyToMessageId}` },
              { id: `tg-out-${input.chatId}-${input.replyToMessageId}` },
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
        replyToMessageId: replyToMessage?.id ?? (input.replyToMessageId ? `tg-${chatId}-${input.replyToMessageId}` : ""),
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
        lastActivityAt: activityAt
      }
    });

    return message;
  }).then(async (result) => {
    if (input.direction === "in") {
      await runInboundMessageAutomations(result.conversationId, tenantId, input.text);
    }
    return result;
  });
}
