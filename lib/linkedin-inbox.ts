import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";
import { shouldStartConversationClosed } from "./bot-engine";
import type { LinkedinComment } from "./linkedin";

type StoreLinkedinCommentInput = {
  tenantId: string;
  comment: LinkedinComment;
  postTitle?: string;
};

function getCustomerName(actorUrn: string, displayName: string) {
  const cleanName = displayName.trim();
  return cleanName || `LinkedIn ${actorUrn.split(":").pop()?.slice(-4) || "عميل"}`;
}

function isFallbackLinkedinName(name: string, actorUrn: string) {
  return name === getCustomerName(actorUrn, "");
}

function getCustomerInitial(name: string, actorUrn: string) {
  return name.trim().charAt(0) || actorUrn.slice(-1) || "L";
}

export async function storeLinkedinComment(input: StoreLinkedinCommentInput) {
  await ensureSchema();

  const { comment } = input;
  const tenantId = input.tenantId || "tenant-demo";
  const actorUrn = comment.actorUrn || comment.commentId;
  const name = getCustomerName(actorUrn, comment.actorName);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const customerId = `${scopedPrefix}li-${actorUrn}`;
  const conversationId = customerId;
  const messageId = `li-${comment.commentId}`;
  const activityAt = comment.createdAt || new Date().toISOString();
  const startClosed = await shouldStartConversationClosed(tenantId, "linkedin");
  const postUrl = `https://www.linkedin.com/feed/update/${comment.postUrn}`;
  const text = `تعليق: ${comment.text}`;

  const result = await prisma.$transaction(async (tx) => {
    const existingCustomer = await tx.customer.findUnique({ where: { id: customerId } });
    const shouldUpdateName = Boolean(comment.actorName.trim()) || !existingCustomer || isFallbackLinkedinName(existingCustomer.name, actorUrn);
    const customerName = shouldUpdateName ? name : existingCustomer.name;

    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name: customerName,
        phone: actorUrn,
        initial: getCustomerInitial(customerName, actorUrn),
        tenantId
      },
      create: {
        id: customerId,
        name: customerName,
        phone: actorUrn,
        initial: getCustomerInitial(customerName, actorUrn),
        tenantId
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        channel: "linkedin",
        lastMessage: text,
        status: startClosed ? "closed" : "unassigned",
        assignee: "بدون موظف",
        unread: 0,
        windowExpired: 0,
        lastActivityAt: activityAt,
        tenantId
      }
    });

    await restartBotFlowIfClosed(tx, conversationId);

    const message = await tx.message.upsert({
      where: { id: messageId },
      update: {},
      create: {
        id: messageId,
        conversationId,
        direction: "in",
        text,
        time: formatMessageTime(new Date(activityAt)),
        createdAt: activityAt,
        author: "",
        sourceType: "linkedin_comment",
        sourceId: comment.postUrn,
        sourceUrl: postUrl,
        sourceLabel: input.postTitle || "المنشور المرتبط بالتعليق"
      }
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessage: text,
        unread: { increment: 1 },
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    return { conversationId, message };
  });

  await runInboundMessageAutomations(result.conversationId, tenantId, text);

  return result;
}
