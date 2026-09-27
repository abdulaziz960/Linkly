import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { getSubscriptions } from "./subscriptions";

const USAGE_WINDOW_DAYS = 30;

/**
 * Per-tenant usage/cost snapshot for the admin panel - there was
 * previously no visibility into message volume, AI spend, or storage per
 * tenant anywhere in app/linkly-admin007/**, only payment/subscription
 * status (pre-launch audit follow-up finding). Reuses getSubscriptions()
 * for the counts it already computes (employees, conversations, campaign
 * balance) rather than recomputing them.
 */
export async function getTenantUsageStats() {
  await ensureSchema();
  const windowStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000).toISOString();

  const [subscriptions, aiUsage, messageCounts] = await Promise.all([
    getSubscriptions(),
    prisma.aiUsageEvent.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: windowStart } },
      _count: { _all: true },
      _sum: { estimatedCost: true }
    }),
    // Message has no tenantId of its own - it's scoped through its
    // conversation, so a plain groupBy can't do this; a join is required.
    prisma.$queryRaw<Array<{ tenant_id: string; message_count: bigint | number }>>`
      SELECT c.tenant_id as tenant_id, COUNT(m.id) as message_count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.created_at >= ${windowStart}
      GROUP BY c.tenant_id
    `
  ]);

  const aiByTenant = new Map(aiUsage.map((row) => [row.tenantId, { events: row._count._all, costSar: row._sum.estimatedCost ?? 0 }]));
  const messagesByTenant = new Map(messageCounts.map((row) => [row.tenant_id, Number(row.message_count)]));

  return subscriptions.map((subscription) => ({
    ...subscription,
    messagesLast30d: messagesByTenant.get(subscription.tenantId) ?? 0,
    aiEventsLast30d: aiByTenant.get(subscription.tenantId)?.events ?? 0,
    aiCostLast30dSar: Math.round((aiByTenant.get(subscription.tenantId)?.costSar ?? 0) * 100) / 100
  }));
}
