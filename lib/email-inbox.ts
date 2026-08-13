import { createHash } from "crypto";
import { prisma } from "./prisma";
import { formatMessageTime } from "./time";

type IncomingEmail = {
  from: string;
  fromName?: string;
  subject?: string;
  text: string;
  messageId?: string;
  receivedAt?: Date;
};

function key(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export async function storeIncomingEmail(input: IncomingEmail) {
  const email = input.from.trim().toLowerCase();
  const customerId = `email-${key(email)}`;
  const conversationId = `email-${key(email)}`;
  const name = input.fromName?.trim() || email;
  const subject = input.subject?.trim();
  const text = subject ? `${subject}\n\n${input.text}` : input.text;
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const messageId = `email-in-${key(input.messageId || `${email}-${activityAt}-${text}`)}`;

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { name, phone: email, initial: name.charAt(0) || "ب" },
      create: { id: customerId, name, phone: email, initial: name.charAt(0) || "ب" }
    });
    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: { id: conversationId, customerId, lastMessage: text, status: "unassigned", assignee: "بدون موظف", unread: 0, windowExpired: 0, lastActivityAt: activityAt }
    });
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
  });
}
