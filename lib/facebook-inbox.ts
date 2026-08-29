import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";
import { shouldStartConversationClosed } from "./bot-engine";
import { maybeRecordRatingReply, sendRatingThanks } from "./conversation-rating";

type StoreFacebookMessageInput = {
  facebookUserId: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  tenantId?: string;
  messageId?: string;
  author?: string;
  receivedAt?: Date;
  replyToMessageId?: string;
};

function getCustomerName(facebookUserId: string, name?: string) {
  const cleanName = name?.trim();
  return cleanName || `Facebook ${facebookUserId.slice(-4) || "عميل"}`;
}

function getCustomerInitial(name: string, facebookUserId: string) {
  return name.trim().charAt(0) || facebookUserId.slice(-1) || "F";
}

export async function storeFacebookMessage(input: StoreFacebookMessageInput) {
  await ensureSchema();

  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const facebookUserId = input.facebookUserId.replace(/\s+/g, "");
  const tenantId = input.tenantId || "tenant-demo";
  const name = getCustomerName(facebookUserId, input.name);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const customerId = `${scopedPrefix}fb-${facebookUserId}`;
  const conversationId = `${scopedPrefix}fb-${facebookUserId}`;
  const messageId = input.messageId ? `fb-${input.messageId}` : `fb-${input.direction}-${facebookUserId}-${Date.now()}`;
  const startClosed = await shouldStartConversationClosed(tenantId, "facebook");
  const ratingRecorded = input.direction === "in" ? await maybeRecordRatingReply(conversationId, input.text) : false;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name,
        phone: facebookUserId,
        initial: getCustomerInitial(name, facebookUserId),
        tenantId
      },
      create: {
        id: customerId,
        name,
        phone: facebookUserId,
        initial: getCustomerInitial(name, facebookUserId),
        tenantId
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        channel: "facebook",
        lastMessage: input.text,
        status: startClosed ? "closed" : "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt,
        tenantId
      }
    });

    if (input.direction === "in" && !ratingRecorded) {
      await restartBotFlowIfClosed(tx, conversationId);
    }

    const replyToMessage = input.replyToMessageId
      ? await tx.message.findFirst({
          where: {
            OR: [
              { id: `fb-${input.replyToMessageId}` },
              { id: `fb-out-${input.replyToMessageId}` },
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
        replyToMessageId: replyToMessage?.id ?? (input.replyToMessageId ? `fb-${input.replyToMessageId}` : ""),
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
    if (ratingRecorded) {
      await sendRatingThanks(result.conversationId);
    }
    return result;
  });
}
