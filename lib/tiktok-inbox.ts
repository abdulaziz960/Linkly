import crypto from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { reopenConversationIfClosed } from "./conversation-lifecycle";

/**
 * TikTok's Business Messaging API requires approved Messaging Partner
 * access before its real webhook payload shape and send endpoint can be
 * verified against live docs. This storage helper follows the same
 * tenant-scoped pattern as Telegram/X so the pipeline is ready to wire up
 * once that access is granted - see app/api/tiktok/webhook/route.ts.
 */
type StoreTikTokMessageInput = {
  tenantId?: string;
  tiktokUserId: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  messageId?: string;
  author?: string;
  receivedAt?: Date;
};

function cleanUserId(value: string) {
  return value.replace(/\s+/g, "");
}

function getCustomerName(userId: string, name?: string) {
  const cleanName = name?.trim();
  return cleanName || `TikTok ${userId.slice(-4) || "عميل"}`;
}

function getCustomerInitial(name: string, userId: string) {
  return name.trim().charAt(0) || userId.slice(-1) || "T";
}

function scopedId(tenantId: string, userId: string) {
  return `tt-${crypto.createHash("sha256").update(`${tenantId}:${userId}`).digest("hex").slice(0, 24)}`;
}

export async function storeTikTokMessage(input: StoreTikTokMessageInput) {
  await ensureSchema();

  const tenantId = input.tenantId || "tenant-demo";
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const userId = cleanUserId(input.tiktokUserId);
  const name = getCustomerName(userId, input.name);
  const customerId = scopedId(tenantId, userId);
  const conversationId = scopedId(tenantId, userId);
  const messageId = input.messageId ? `tt-${input.messageId}` : `tt-${input.direction}-${userId}-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name,
        phone: userId,
        initial: getCustomerInitial(name, userId)
      },
      create: {
        id: customerId,
        tenantId,
        name,
        phone: userId,
        initial: getCustomerInitial(name, userId)
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        tenantId,
        customerId,
        channel: "tiktok",
        lastMessage: input.text,
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    if (input.direction === "in") {
      await reopenConversationIfClosed(tx, conversationId);
    }

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
        author: input.author || ""
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
