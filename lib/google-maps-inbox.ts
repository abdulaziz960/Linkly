import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { formatMessageTime } from "./time";

type StoreGoogleMapsReviewInput = {
  reviewId: string;
  reviewerName?: string;
  rating?: number;
  comment?: string;
  reviewUrl?: string;
  receivedAt?: Date;
  locationName?: string;
  existingReply?: string;
};

function getCustomerName(input: StoreGoogleMapsReviewInput) {
  return input.reviewerName?.trim() || `Google Review ${input.reviewId.slice(-4) || "عميل"}`;
}

function getReviewText(input: StoreGoogleMapsReviewInput) {
  const rating = input.rating ? `تقييم ${input.rating} نجوم` : "تقييم Google";
  const comment = input.comment?.trim() || "بدون تعليق نصي";
  return `${rating}: ${comment}`;
}

export async function storeGoogleMapsReview(input: StoreGoogleMapsReviewInput) {
  await ensureSchema();

  const cleanReviewId = input.reviewId.trim();
  const activityAt = (input.receivedAt ?? new Date()).toISOString();
  const customerName = getCustomerName(input);
  const customerId = `gm-${cleanReviewId}`;
  const conversationId = customerId;
  const messageId = `gm-review-${cleanReviewId}`;
  const reviewText = getReviewText(input);

  return prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: {
        name: customerName,
        phone: cleanReviewId,
        initial: customerName.charAt(0) || "G"
      },
      create: {
        id: customerId,
        name: customerName,
        phone: cleanReviewId,
        initial: customerName.charAt(0) || "G"
      }
    });

    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {
        lastMessage: reviewText,
        lastActivityAt: activityAt
      },
      create: {
        id: conversationId,
        customerId,
        channel: "google_maps",
        lastMessage: reviewText,
        status: "unassigned",
        assignee: "بدون موظف",
        unread: 1,
        windowExpired: 0,
        lastActivityAt: activityAt
      }
    });

    const message = await tx.message.upsert({
      where: { id: messageId },
      update: {
        text: reviewText,
        sourceUrl: input.reviewUrl || "",
        sourceLabel: input.locationName || "تقييم Google"
      },
      create: {
        id: messageId,
        conversationId,
        direction: "in",
        text: reviewText,
        time: formatMessageTime(input.receivedAt ?? new Date()),
        createdAt: activityAt,
        author: customerName,
        sourceType: "google_review",
        sourceId: cleanReviewId,
        sourceUrl: input.reviewUrl || "",
        sourceLabel: input.locationName || "تقييم Google"
      }
    });

    if (input.existingReply?.trim()) {
      await tx.message.upsert({
        where: { id: `gm-reply-${cleanReviewId}` },
        update: {},
        create: {
          id: `gm-reply-${cleanReviewId}`,
          conversationId,
          direction: "out",
          text: input.existingReply.trim(),
          time: formatMessageTime(input.receivedAt ?? new Date()),
          createdAt: activityAt,
          author: "Google Business",
          sourceType: "google_review_reply",
          sourceId: cleanReviewId,
          sourceUrl: input.reviewUrl || "",
          sourceLabel: input.locationName || "رد سابق"
        }
      });
    }

    return { conversationId, message };
  });
}
