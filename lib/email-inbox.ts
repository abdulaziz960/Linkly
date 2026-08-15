import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export type IncomingEmail = {
  tenantId: string;
  from: string;
  fromName?: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  threadId?: string;
  internetMessageId?: string;
  receivedAt?: string;
};

function stableId(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function stripHtml(value = "") {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function storeEmailMessage(input: IncomingEmail) {
  const tenantId = input.tenantId || "tenant-demo";
  const email = input.from.trim().toLowerCase();
  if (!email) throw new Error("Missing sender email");

  const tenantKey = stableId(tenantId);
  const senderKey = stableId(email);
  const customerId = `email-${tenantKey}-${senderKey}`;
  const conversationId = customerId;
  const sourceId = input.messageId || input.internetMessageId || stableId(`${email}:${input.subject}:${input.receivedAt}:${input.text}`);
  const messageId = `email-in-${tenantKey}-${stableId(sourceId)}`;
  const createdAt = input.receivedAt || new Date().toISOString();
  const body = (input.text || stripHtml(input.html) || "رسالة بريد واردة").trim();
  const senderName = input.fromName?.trim() || email.split("@")[0] || "عميل البريد";
  const initial = senderName.slice(0, 1).toUpperCase() || "@";

  const customer = await prisma.customer.upsert({
    where: { id: customerId },
    create: { id: customerId, tenantId, name: senderName, phone: email, initial },
    update: { tenantId, name: senderName, phone: email, initial },
  });

  const conversation = await prisma.conversation.upsert({
    where: { id: conversationId },
    create: {
      id: conversationId,
      tenantId,
      customerId: customer.id,
      channel: "email",
      status: "unassigned",
      assignee: "",
      lastMessage: body,
      unread: 1,
      lastActivityAt: createdAt,
    },
    update: {
      tenantId,
      customerId: customer.id,
      channel: "email",
      lastMessage: body,
      lastActivityAt: createdAt,
      unread: { increment: 1 },
    },
  });

  const message = await prisma.message.upsert({
    where: { id: messageId },
    create: {
      id: messageId,
      conversationId: conversation.id,
      direction: "in",
      text: body,
      time: createdAt,
      createdAt,
      sourceType: "email",
      sourceId,
      sourceLabel: input.subject || "بدون عنوان",
      replyToMessageId: input.threadId || "",
      replyToText: input.internetMessageId || "",
      replyToAuthor: "",
    },
    update: {},
  });

  return { customer, conversation, message };
}
