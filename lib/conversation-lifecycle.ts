import type { Prisma } from "@prisma/client";

/**
 * A closed conversation that the customer messages again should behave like a
 * brand-new conversation: reopen it and let the auto-reply bot run again
 * (botRanAt/botWaitingNodeTitle gate whether runChannelBot fires the welcome flow).
 */
export async function reopenConversationIfClosed(tx: Prisma.TransactionClient, conversationId: string) {
  const existing = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true }
  });
  if (existing?.status !== "closed") return;
  await tx.conversation.update({
    where: { id: conversationId },
    data: { status: "unassigned", botRanAt: "", botWaitingNodeTitle: "" }
  });
}
