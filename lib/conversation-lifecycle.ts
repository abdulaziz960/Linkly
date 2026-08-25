import type { Prisma } from "@prisma/client";

/**
 * A closed conversation that the customer messages again should run the
 * auto-reply bot from the start again (botRanAt/botWaitingNodeId gate
 * whether runChannelBot fires the welcome flow) - but it must stay closed,
 * out of employees' queues, until the bot itself transfers it to a team
 * (lib/bot-engine.ts's "تحويل لفريق" node, which sets status to
 * assigned/unassigned). Only that transfer should reopen it.
 */
export async function restartBotFlowIfClosed(tx: Prisma.TransactionClient, conversationId: string) {
  const existing = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true }
  });
  if (existing?.status !== "closed") return;
  await tx.conversation.update({
    where: { id: conversationId },
    data: { botRanAt: "", botWaitingNodeId: "" }
  });
}
