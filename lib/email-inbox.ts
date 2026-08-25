import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";

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

  await restartBotFlowIfClosed(prisma, conversation.id);

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

  await runInboundMessageAutomations(conversation.id, tenantId, body);

  return { customer, conversation, message };
}

function key(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

type LegacyIncomingEmail = {
  from: string;
  fromName?: string;
  subject?: string;
  text: string;
  messageId?: string;
  receivedAt?: Date;
  tenantId?: string;
};

export async function storeIncomingEmail(input: LegacyIncomingEmail) {
  const tenantId = input.tenantId || "tenant-demo";
  const from = input.from.trim();
  const addressMatch = from.match(/<([^>]+)>/);
  const email = (addressMatch?.[1] || from).trim().toLowerCase();
  const customerId = `email-${key(`${tenantId}:${email}`)}`;
  const conversationId = `email-${key(`${tenantId}:${email}`)}`;
  const headerName = from.replace(/<[^>]+>/, "").replace(/^[\s\"']+|[\s\"']+$/g, "");
  const name = input.fromName?.trim() || headerName || email;
  const subject = input.subject?.trim();
  const text = subject ? `${subject}\n\n${input.text}` : input.text;
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const messageId = `email-in-${key(input.messageId || `${email}-${activityAt}-${text}`)}`;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { name, phone: email, initial: name.charAt(0) || "ب" },
      create: { id: customerId, tenantId, name, phone: email, initial: name.charAt(0) || "ب" }
    });
    await tx.conversation.upsert({
      where: { id: conversationId },
      update: { channel: "email" },
      create: { id: conversationId, tenantId, customerId, channel: "email", lastMessage: text, status: "unassigned", assignee: "بدون موظف", unread: 0, windowExpired: 0, lastActivityAt: activityAt }
    });
    await restartBotFlowIfClosed(tx, conversationId);

    await tx.message.upsert({
      where: { id: messageId },
      update: {},
      create: { id: messageId, conversationId, direction: "in", text, time: formatMessageTime(), author: "" }
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessage: text, unread: { increment: 1 }, lastActivityAt: activityAt, windowExpired: 0 }
    });
    return { conversationId, messageId };
  }).then(async (result) => {
    await runInboundMessageAutomations(result.conversationId, tenantId, text);
    return result;
  });
}
