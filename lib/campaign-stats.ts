import { prisma } from "./prisma";
import { campaignCost, computeCampaignStats, effectiveMessageRate, type CampaignStats } from "./campaign-metrics";

/** What one message costs when the workspace has no completed top-up yet: the standard small-volume price. */
export const DEFAULT_MESSAGE_RATE = 0.03;

type FunnelRow = { campaign_id: string; delivered: unknown; read: unknown; replied: unknown; delivery_failed: unknown };

/**
 * The real numbers of every campaign of a workspace, read from its recipient rows (not from the running counters
 * on the campaign, which can drift): one grouped query per question, whatever the number of campaigns.
 */
export async function loadCampaignStats(tenantId: string, campaigns: Array<{ id: string; total: number }>): Promise<Map<string, { stats: CampaignStats; cost: number }>> {
  const result = new Map<string, { stats: CampaignStats; cost: number }>();
  if (!campaigns.length) return result;

  const [statusGroups, failureGroups, funnelRows, payments] = await Promise.all([
    prisma.campaignRecipient.groupBy({ by: ["campaignId", "status"], where: { tenantId }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ["campaignId", "error"], where: { tenantId, status: "فشل الإرسال" }, _count: { _all: true } }),
    prisma.$queryRaw<FunnelRow[]>`
      SELECT campaign_id,
        SUM(CASE WHEN delivered_at <> '' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN read_at <> '' THEN 1 ELSE 0 END) AS read,
        SUM(CASE WHEN replied_at <> '' THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN delivery_failed = 1 THEN 1 ELSE 0 END) AS delivery_failed
      FROM campaign_recipients
      WHERE tenant_id = ${tenantId}
      GROUP BY campaign_id`,
    prisma.campaignPayment.findMany({ where: { tenantId }, select: { messages: true, amount: true, status: true } })
  ]);

  const rate = effectiveMessageRate(payments, DEFAULT_MESSAGE_RATE);
  const funnel = new Map(funnelRows.map((row) => [row.campaign_id, row]));

  for (const campaign of campaigns) {
    const row = funnel.get(campaign.id);
    const stats = computeCampaignStats({
      total: campaign.total,
      statusCounts: statusGroups.filter((group) => group.campaignId === campaign.id).map((group) => ({ status: group.status, count: group._count._all })),
      failureErrors: failureGroups.filter((group) => group.campaignId === campaign.id).map((group) => ({ error: group.error, count: group._count._all })),
      deliveredCount: Number(row?.delivered ?? 0),
      readCount: Number(row?.read ?? 0),
      repliedCount: Number(row?.replied ?? 0),
      deliveryFailedCount: Number(row?.delivery_failed ?? 0)
    });
    result.set(campaign.id, { stats, cost: campaignCost(stats.sent, rate) });
  }
  return result;
}
