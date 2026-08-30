import { prisma } from "./prisma";

const isPostType = (sourceType: string) => sourceType === "x_post" || sourceType === "x_post_reply";

// A conversation started from a public mention/comment must keep replying
// publicly on that same post by default instead of silently switching to a
// DM - decided from whichever type the conversation's most recent message
// is. The tweet actually replied to is always the customer's most recent
// public comment/mention, never our own previous public reply (anchoring to
// "whatever we last sent" would make each new reply nest one level deeper on
// X, drifting away from the original post/comment on every message).
// Returns null when the conversation should get a DM instead.
export async function resolveXPostReplyTarget(conversationId: string) {
  const latestMessage = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "desc" }
  });
  if (!latestMessage || !isPostType(latestMessage.sourceType)) return null;

  const postSourceMessage = await prisma.message.findFirst({
    where: { conversationId, direction: "in", sourceType: "x_post" },
    orderBy: { createdAt: "desc" }
  });
  if (!postSourceMessage?.sourceId) return null;

  return postSourceMessage;
}
