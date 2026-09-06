import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";
import { runInboundMessageAutomations } from "./automation-engine";
import { restartBotFlowIfClosed } from "./conversation-lifecycle";
import { shouldStartConversationClosed } from "./bot-engine";
import type { YoutubeCommentThread } from "./youtube";

type StoreYoutubeCommentInput = {
  tenantId: string;
  comment: YoutubeCommentThread;
  videoTitle?: string;
};

function getCustomerName(authorChannelId: string, displayName: string) {
  const cleanName = displayName.trim();
  return cleanName || `YouTube ${authorChannelId.slice(-4) || "عميل"}`;
}

function isFallbackYoutubeName(name: string, authorChannelId: string) {
  return name === getCustomerName(authorChannelId, "");
}

function getCustomerInitial(name: string, authorChannelId: string) {
  return name.trim().charAt(0) || authorChannelId.slice(-1) || "Y";
}

export async function storeYoutubeComment(input: StoreYoutubeCommentInput) {
  await ensureSchema();

  const { comment } = input;
  const tenantId = input.tenantId || "tenant-demo";
  const authorChannelId = comment.authorChannelId || comment.topLevelCommentId;
  const name = getCustomerName(authorChannelId, comment.authorDisplayName);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const customerId = `${scopedPrefix}yt-${authorChannelId}`;
  const conversationId = customerId;
  const messageId = `yt-${comment.topLevelCommentId}`;
  const activityAt = comment.publishedAt || new Date().toISOString();
  const startClosed = await shouldStartConversationClosed(tenantId, "youtube");
  const videoUrl = `https://www.youtube.com/watch?v=${comment.videoId}`;
  const text = `تعليق: ${comment.textOriginal}`;

  const result = await prisma.$transaction(async (tx) => {
    const existingCustomer = await tx.customer.findUnique({ where: { id: customerId } });
    const shouldUpdateName = Boolean(comment.authorDisplayName.trim()) || !existingCustomer || isFallbackYoutubeName(existingCustomer.name, authorChannelId);
    const customerName = shouldUpdateName ? name : existingCustomer.name;

    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name: customerName,
        phone: authorChannelId,
        initial: getCustomerInitial(customerName, authorChannelId),
        tenantId
      },
      create: {
        id: customerId,
        name: customerName,
        phone: authorChannelId,
        initial: getCustomerInitial(customerName, authorChannelId),
        tenantId
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        customerId,
        channel: "youtube",
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
        sourceType: "youtube_comment",
        sourceId: comment.videoId,
        sourceUrl: videoUrl,
        sourceLabel: input.videoTitle || "الفيديو المرتبط بالتعليق"
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
