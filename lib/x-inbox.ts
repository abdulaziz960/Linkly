import crypto from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";

type StoreXMessageInput = {
  tenantId?: string;
  xUserId: string;
  name?: string;
  text: string;
  direction: "in" | "out";
  messageId?: string;
  author?: string;
  receivedAt?: Date;
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

function scopedId(tenantId: string, xUserId: string) {
  if (tenantId === "tenant-demo") return `x-${xUserId}`;
  return `x-${crypto.createHash("sha256").update(`${tenantId}:${xUserId}`).digest("hex").slice(0, 24)}`;
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
  const name = getCustomerName(xUserId, input.name);
  const customerId = scopedId(tenantId, xUserId);
  const conversationId = scopedId(tenantId, xUserId);
  const messageId = input.messageId ? `x-${input.messageId}` : `x-${input.direction}-${xUserId}-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name,
        phone: xUserId,
        initial: getCustomerInitial(name, xUserId)
      },
      create: {
        id: customerId,
        tenantId,
        name,
        phone: xUserId,
        initial: getCustomerInitial(name, xUserId)
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        tenantId,
        customerId,
        channel: "x",
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
}
