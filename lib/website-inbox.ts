import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";
import { shouldStartConversationClosed } from "./bot-engine";
import { maybeRecordRatingReply, sendRatingThanks } from "./conversation-rating";

function stableId(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function websiteConversationId(tenantId: string, visitorId: string) {
  return `web-${stableId(`${tenantId}:${visitorId}`)}`;
}

export type IncomingWebsiteMessage = {
  tenantId: string;
  visitorId: string;
  name?: string;
  email?: string;
  text: string;
};

export async function storeWebsiteMessage(input: IncomingWebsiteMessage) {
  const tenantId = input.tenantId;
  const visitorId = input.visitorId.trim();
  if (!visitorId) throw new Error("Missing visitor id");

  const text = input.text.trim();
  if (!text) throw new Error("Missing message text");

  const id = websiteConversationId(tenantId, visitorId);
  const name = input.name?.trim() || "زائر الموقع";
  const initial = name.charAt(0) || "ز";
  const contact = input.email?.trim() || visitorId;
  const createdAt = new Date().toISOString();
  const messageId = `web-in-${stableId(`${id}:${createdAt}:${text}:${Math.random()}`)}`;
  const startClosed = await shouldStartConversationClosed(tenantId, "website");
  const ratingRecorded = await maybeRecordRatingReply(id, text);

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id },
      create: { id, tenantId, name, phone: contact, initial },
      update: { name, phone: contact, initial }
    });

    await tx.conversation.upsert({
      where: { id },
      create: {
        id,
        tenantId,
        customerId: id,
        channel: "website",
        status: startClosed ? "closed" : "unassigned",
        assignee: "",
        lastMessage: text,
        unread: 1,
        lastActivityAt: createdAt
      },
      update: {
        lastMessage: text,
        unread: { increment: 1 },
        lastActivityAt: createdAt
      }
    });

    if (!ratingRecorded) {
      await restartBotFlowIfClosed(tx, id);
    }

    const message = await tx.message.create({
      data: {
        id: messageId,
        conversationId: id,
        direction: "in",
        text,
        time: formatMessageTime(),
        createdAt,
        author: ""
      }
    });

    return { conversationId: id, message };
  }).then(async (result) => {
    await runInboundMessageAutomations(result.conversationId, tenantId, text);
    if (ratingRecorded) {
      await sendRatingThanks(result.conversationId);
    }
    return result;
  });
}
