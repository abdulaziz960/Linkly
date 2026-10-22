import { createHash } from "crypto";
import { prisma } from "./prisma";

/**
 * A small fingerprint of the inbox a user can see, computed from a handful of light queries that never read
 * message bodies: the conversations' own fields (with the customer's name and phone), and per-delivery-status
 * message counts with the newest message time, plus counts of transcripts, attachments and tags. A new
 * message, a deletion, a delivery update (sent -> delivered -> read), a status / assignee change, an
 * attachment arriving or a tag moves it.
 *
 * Used by GET /api/conversations/version (the dashboard's live check) and by GET /api/conversations (to answer
 * an unchanged inbox from memory instead of rebuilding the 2 MB body).
 */
export async function inboxFingerprint(tenantId: string, assignee: string | string[] | undefined): Promise<string> {
  const assigneeFilter = Array.isArray(assignee) ? { in: assignee } : assignee;
  const conversationWhere = assigneeFilter ? { tenantId, assignee: assigneeFilter } : { tenantId };

  const [conversations, messageGroups, transcripts, attachments, tags] = await Promise.all([
    prisma.conversation.findMany({
      where: conversationWhere,
      select: {
        id: true, status: true, assignee: true, unread: true, windowExpired: true, lastActivityAt: true, lastMessage: true,
        rating: true, closedAt: true, pipelineStage: true, dealValue: true,
        customer: { select: { name: true, phone: true } }
      },
      orderBy: { id: "asc" }
    }),
    prisma.message.groupBy({
      by: ["deliveryStatus"],
      where: { conversation: conversationWhere },
      _count: { _all: true },
      _max: { createdAt: true }
    }),
    prisma.message.count({ where: { conversation: conversationWhere, transcript: { not: "" } } }),
    // A file attached to a message after it was stored (incoming media is downloaded in parallel).
    prisma.message.count({ where: { conversation: conversationWhere, attachmentType: { not: "" } } }),
    // Per tag name, so swapping one tag for another moves it even though the total stays the same.
    prisma.conversationTag.groupBy({ by: ["tagName"], where: { conversation: conversationWhere }, _count: { _all: true } })
  ]);

  const fingerprint = JSON.stringify([conversations, messageGroups.map((group) => [group.deliveryStatus, group._count._all, group._max.createdAt]).sort(), transcripts, attachments, tags.map((tag) => [tag.tagName, tag._count._all]).sort()]);
  return createHash("sha1").update(fingerprint).digest("base64url");
}
