import type { Prisma } from "@prisma/client";

/**
 * A closed conversation that the customer messages again should run the
 * auto-reply bot from the start again (botRanAt gates whether runChannelBot
 * fires the welcome flow) - but it must stay closed, out of employees'
 * queues, until the bot itself transfers it to a team (lib/bot-engine.ts's
 * "تحويل لفريق" node, which sets status to assigned/unassigned). Only that
 * transfer should reopen it.
 *
 * Only restart when the bot isn't already waiting on a reply. A closed
 * conversation stays closed for the customer's whole trip through the menu
 * (they're not transferred yet), so every one of their replies while a list
 * step is waiting must still go through runChannelBot's normal matching -
 * resetting on every inbound message here would throw away their answer to
 * whatever the bot just asked and restart the flow from the top instead.
 */
export async function restartBotFlowIfClosed(tx: Prisma.TransactionClient, conversationId: string) {
  const existing = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true, botWaitingNodeId: true }
  });
  if (existing?.status !== "closed" || existing.botWaitingNodeId) return;
  await tx.conversation.update({
    where: { id: conversationId },
    data: { botRanAt: "" }
  });
}
