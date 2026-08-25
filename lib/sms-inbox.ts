import crypto from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";

/**
 * Storage helper for inbound SMS, ready to be called once the Unifonic
 * incoming-message webhook payload shape is confirmed against a real
 * account (their full webhook docs are behind a login) - see
 * app/api/sms/webhook/route.ts.
 */
type StoreSmsMessageInput = {
  tenantId?: string;
  phone: string;
  text: string;
  direction: "in" | "out";
  messageId?: string;
  author?: string;
  receivedAt?: Date;
};

function cleanPhone(value: string) {
  return value.replace(/\s+/g, "");
}

function scopedId(tenantId: string, phone: string) {
  return `sms-${crypto.createHash("sha256").update(`${tenantId}:${phone}`).digest("hex").slice(0, 24)}`;
}

export async function storeSmsMessage(input: StoreSmsMessageInput) {
  await ensureSchema();

  const tenantId = input.tenantId || "tenant-demo";
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const phone = cleanPhone(input.phone);
  const customerId = scopedId(tenantId, phone);
  const conversationId = scopedId(tenantId, phone);
  const messageId = input.messageId ? `sms-${input.messageId}` : `sms-${input.direction}-${phone}-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { phone },
      create: {
        id: customerId,
        tenantId,
        name: `SMS ${phone.slice(-4) || "عميل"}`,
        phone,
        initial: "S"
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        tenantId,
        customerId,
        channel: "sms",
        lastMessage: input.text,
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    if (input.direction === "in") {
      await restartBotFlowIfClosed(tx, conversationId);
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
