import { prisma } from "./prisma";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";
import { campaignCost, computeCampaignStats, effectiveMessageRate, type CampaignStats } from "./campaign-metrics";

/** What one message costs when the workspace has no completed top-up yet: the standard small-volume price. */
export const DEFAULT_MESSAGE_RATE = 0.03;

type FunnelRow = { campaign_id: string; read_n: unknown; delivered_n: unknown; failed_after_n: unknown; replied_n: unknown; interacted_n: unknown; first_sent: string | null };

/**
 * The real numbers of every campaign of a workspace, read from its recipient rows (not from the running counters
 * on the campaign, which can drift): one grouped query per question, whatever the number of campaigns.
 */
export async function loadCampaignStats(tenantId: string, campaigns: Array<{ id: string; total: number }>): Promise<Map<string, { stats: CampaignStats; cost: number; firstSentAt: string }>> {
  const result = new Map<string, { stats: CampaignStats; cost: number; firstSentAt: string }>();
  if (!campaigns.length) return result;

  // "Read" rows (a read receipt or a click) are counted first and separately; every other count leaves them out,
  // the same order of checks the campaign report uses, so the numbers on both always agree.
  const unread = { readAt: "", clickedAt: "" };
  const [statusGroups, failureGroups, deliveryFailureGroups, funnelRows, payments, optedOut] = await Promise.all([
    prisma.campaignRecipient.groupBy({ by: ["campaignId", "status"], where: { tenantId, ...unread }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ["campaignId", "error"], where: { tenantId, status: "فشل الإرسال", ...unread }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ["campaignId", "deliveryError"], where: { tenantId, status: "تم الإرسال", deliveryFailed: 1, ...unread }, _count: { _all: true } }),
    prisma.$queryRaw<FunnelRow[]>`
      SELECT campaign_id,
        SUM(CASE WHEN read_at <> '' OR clicked_at <> '' THEN 1 ELSE 0 END) AS read_n,
        SUM(CASE WHEN read_at = '' AND clicked_at = '' AND status = 'تم الإرسال' AND delivery_failed = 0 AND delivered_at <> '' THEN 1 ELSE 0 END) AS delivered_n,
        SUM(CASE WHEN read_at = '' AND clicked_at = '' AND status = 'تم الإرسال' AND delivery_failed = 1 THEN 1 ELSE 0 END) AS failed_after_n,
        SUM(CASE WHEN replied_at <> '' THEN 1 ELSE 0 END) AS replied_n,
        SUM(CASE WHEN replied_at <> '' OR clicked_at <> '' THEN 1 ELSE 0 END) AS interacted_n,
        MIN(CASE WHEN sent_at <> '' THEN sent_at END) AS first_sent
      FROM campaign_recipients
      WHERE tenant_id = ${tenantId}
      GROUP BY campaign_id`,
    prisma.campaignPayment.findMany({ where: { tenantId }, select: { messages: true, amount: true, status: true } }),
    prisma.customer.findMany({ where: { tenantId, marketingOptOut: 1 }, select: { phone: true, marketingOptOutAt: true } })
  ]);

  // Opt-outs attributed to a campaign: the customer left at/after that campaign's send.
  const optOutAtByPhone = new Map<string, string>();
  for (const customer of optedOut) {
    const phone = normalizeWhatsAppPhone(customer.phone);
    if (phone) optOutAtByPhone.set(phone, customer.marketingOptOutAt || "");
  }
  const unsubscribedByCampaign = new Map<string, number>();
  if (optOutAtByPhone.size) {
    const sentToOptedOut = await prisma.campaignRecipient.findMany({ where: { tenantId, sentAt: { not: "" } }, select: { campaignId: true, phone: true, sentAt: true } });
    for (const recipient of sentToOptedOut) {
      const phone = normalizeWhatsAppPhone(recipient.phone);
      if (!phone || !optOutAtByPhone.has(phone)) continue;
      const at = optOutAtByPhone.get(phone) || "";
      if (!at || at >= recipient.sentAt) unsubscribedByCampaign.set(recipient.campaignId, (unsubscribedByCampaign.get(recipient.campaignId) ?? 0) + 1);
    }
  }

  const rate = effectiveMessageRate(payments, DEFAULT_MESSAGE_RATE);
  const funnel = new Map(funnelRows.map((row) => [row.campaign_id, row]));

  for (const campaign of campaigns) {
    const row = funnel.get(campaign.id);
    const stats = computeCampaignStats({
      total: campaign.total,
      statusCounts: statusGroups.filter((group) => group.campaignId === campaign.id).map((group) => ({ status: group.status, count: group._count._all })),
      failureErrors: failureGroups.filter((group) => group.campaignId === campaign.id).map((group) => ({ error: group.error, count: group._count._all })),
      deliveryFailureErrors: deliveryFailureGroups.filter((group) => group.campaignId === campaign.id).map((group) => ({ error: group.deliveryError, count: group._count._all })),
      readCount: Number(row?.read_n ?? 0),
      deliveredCount: Number(row?.delivered_n ?? 0),
      deliveryFailedCount: Number(row?.failed_after_n ?? 0),
      repliedCount: Number(row?.replied_n ?? 0),
      interactedCount: Number(row?.interacted_n ?? 0),
      unsubscribedCount: unsubscribedByCampaign.get(campaign.id) ?? 0
    });
    result.set(campaign.id, { stats, cost: campaignCost(stats.sent, rate), firstSentAt: row?.first_sent ?? "" });
  }
  return result;
}
