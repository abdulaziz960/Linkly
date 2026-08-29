import crypto from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";
import { shouldStartConversationClosed } from "./bot-engine";
import { maybeRecordRatingReply, sendRatingThanks } from "./conversation-rating";

type StoreXMessageInput = {
  tenantId?: string;
  xUserId: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  messageId?: string;
  author?: string;
  receivedAt?: Date;
  conversationKey?: string;
  recipientId?: string;
  source?: {
    type: string;
    id?: string;
    url?: string;
    label?: string;
  };
};

function cleanXUserId(value: string) {
  return value.replace(/\s+/g, "").replace(/^@/, "");
}

function scopedId(tenantId: string, identity: string) {
  if (tenantId === "tenant-demo") {
    return `x-${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
  }
  return `x-${crypto.createHash("sha256").update(`${tenantId}:${identity}`).digest("hex").slice(0, 24)}`;
}

function getCustomerName(xUserId: string, name?: string) {
  const cleanName = name?.trim();
  return cleanName || `X ${xUserId.slice(-4) || "عميل"}`;
}

function getCustomerInitial(name: string, xUserId: string) {
  return name.trim().charAt(0) || xUserId.slice(-1) || "X";
}

export async function storeXMessage(input: StoreXMessageInput) {
  await ensureSchema();

  const tenantId = input.tenantId || "tenant-demo";
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const xUserId = cleanXUserId(input.xUserId);
  const identity = input.conversationKey?.trim() || xUserId;
  const recipientId = input.recipientId?.trim() || xUserId;
  const name = getCustomerName(xUserId, input.name);
  const customerId = scopedId(tenantId, identity);
  const conversationId = scopedId(tenantId, identity);
  const messageId = input.messageId ? `x-${input.messageId}` : `x-${input.direction}-${identity}-${Date.now()}`;

  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (existing) return existing;

  const startClosed = await shouldStartConversationClosed(tenantId, "x");
  const ratingRecorded = input.direction === "in" ? await maybeRecordRatingReply(conversationId, input.text) : false;

  const result = await prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name,
        phone: recipientId,
        initial: getCustomerInitial(name, xUserId)
      },
      create: {
        id: customerId,
        tenantId,
        name,
        phone: recipientId,
        initial: getCustomerInitial(name, xUserId)
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: { customerId },
      create: {
        id: conversationId,
        tenantId,
        customerId,
        channel: "x",
        lastMessage: input.text,
        status: startClosed ? "closed" : "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    if (input.direction === "in" && !ratingRecorded) {
      await restartBotFlowIfClosed(tx, conversationId);
    }

    const message = await tx.message.create({
      data: {
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
        replyToMessageId: "",
        replyToText: "",
        replyToAuthor: ""
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
  });

  if (input.direction === "in") {
    await runInboundMessageAutomations(result.conversationId, tenantId, input.text);
  }
  if (ratingRecorded) {
    await sendRatingThanks(result.conversationId);
  }

  return result;
}
