import { prisma } from "./prisma";
import { listEmailCampaigns } from "./email-promotions";
import { ensureEmailPromotionsSchema } from "./email-promotions-schema";
import type { EngagementBucket } from "./campaign-engagement";

import { emailEngagementBucket } from "./email-segments";
export { emailEngagementBucket };

export type EmailEngagementRow = { name: string; email: string; campaignName: string; clickCount: number };
export type EmailEngagementResult = { counts: Record<EngagementBucket, number>; rows: Record<EngagementBucket, EmailEngagementRow[]> };

const rank: Record<EngagementBucket, number> = { unsubscribed: 5, clicked: 4, opened: 3, notOpened: 2, notReceived: 1 };

/** Cross-campaign breakdown of email recipients (each address counted once under its best outcome), optionally for one campaign and a send-date range. */
export async function getEmailEngagement(tenantId: string, dateFrom: string, dateTo: string, campaignId: string): Promise<EmailEngagementResult> {
  await ensureEmailPromotionsSchema();
  const recipients = await prisma.emailCampaignRecipient.findMany({
    where: {
      tenantId,
      ...(campaignId ? { campaignId } : {}),
      ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: `${dateTo}T23:59:59.999Z` } : {}) } } : {})
    }
  });
  const names = new Map((await prisma.emailCampaign.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((campaign) => [campaign.id, campaign.name]));
  const best = new Map<string, { bucket: EngagementBucket; row: EmailEngagementRow }>();
  for (const recipient of recipients) {
    const bucket = emailEngagementBucket(recipient);
    if (!bucket) continue;
    const email = recipient.email.trim().toLowerCase();
    const existing = best.get(email);
    if (!existing || rank[bucket] > rank[existing.bucket]) best.set(email, { bucket, row: { name: recipient.name, email, campaignName: names.get(recipient.campaignId) || "", clickCount: recipient.clickCount } });
  }
  const counts: Record<EngagementBucket, number> = { notReceived: 0, notOpened: 0, opened: 0, clicked: 0, unsubscribed: 0 };
  const rows: Record<EngagementBucket, EmailEngagementRow[]> = { notReceived: [], notOpened: [], opened: [], clicked: [], unsubscribed: [] };
  for (const { bucket, row } of best.values()) { counts[bucket] += 1; rows[bucket].push(row); }
  return { counts, rows };
}

export type EmailUnsubscribed = { name: string; email: string; unsubscribedAt: string; campaignName: string; source: string };

export async function getEmailUnsubscribed(tenantId: string, dateFrom: string, dateTo: string): Promise<EmailUnsubscribed[]> {
  await ensureEmailPromotionsSchema();
  const optOuts = await prisma.emailMarketingOptOut.findMany({
    where: { tenantId, ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: `${dateTo}T23:59:59.999Z` } : {}) } } : {}) },
    orderBy: { createdAt: "desc" }
  });
  if (!optOuts.length) return [];
  const recipients = await prisma.emailCampaignRecipient.findMany({ where: { tenantId, email: { in: optOuts.map((row) => row.email) } }, orderBy: { createdAt: "desc" }, select: { email: true, name: true, campaignId: true } });
  const names = new Map((await prisma.emailCampaign.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((campaign) => [campaign.id, campaign.name]));
  const latest = new Map<string, { name: string; campaignName: string }>();
  for (const recipient of recipients) if (!latest.has(recipient.email)) latest.set(recipient.email, { name: recipient.name, campaignName: names.get(recipient.campaignId) || "" });
  return optOuts.map((row) => ({ name: latest.get(row.email)?.name || "", email: row.email, unsubscribedAt: row.createdAt, campaignName: latest.get(row.email)?.campaignName || "", source: row.source }));
}

export { listEmailCampaigns };
