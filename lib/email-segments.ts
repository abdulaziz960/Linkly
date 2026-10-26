import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureEmailPromotionsSchema } from "./email-promotions-schema";
import { isCustomerInactive, matchesAnyTag } from "./segments";
import type { EngagementBucket } from "./campaign-engagement";

/** Where an email recipient ended up: opting out wins, then click, open, bounce; a still-pending row has no outcome yet. */
export function emailEngagementBucket(row: { status: string; openCount: number; clickCount: number; openedAt?: string; clickedAt?: string; unsubscribedAt?: string }): EngagementBucket | null {
  if (row.unsubscribedAt || row.status === "unsubscribed") return "unsubscribed";
  if (row.clickCount > 0 || row.clickedAt) return "clicked";
  if (row.openCount > 0 || row.openedAt) return "opened";
  if (row.status === "failed" || row.status === "bounced") return "notReceived";
  if (row.status === "pending") return null;
  return "notOpened";
}

const validBuckets = new Set(["notReceived", "notOpened", "opened", "clicked", "unsubscribed"]);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export type EmailSegmentCriteria = {
  tagNames: string[];
  inactiveDays: number;
  sourceCampaignId: string;
  engagementBucket: EngagementBucket | "";
  engagementDateFrom: string;
  engagementDateTo: string;
};
export type EmailSegmentRecord = EmailSegmentCriteria & { id: string; name: string; createdAt: string; updatedAt: string; recipientCount: number };
export type EmailSegmentMember = { customerId: string; name: string; email: string; campaignName: string };

type Row = { id: string; name: string; tag_names: string; inactive_days: number | bigint; source_campaign_id: string; engagement_bucket: string; date_from: string; date_to: string; created_at: string; updated_at: string };

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toCriteria(row: Row): EmailSegmentCriteria & { id: string; name: string; createdAt: string; updatedAt: string } {
  return {
    id: row.id, name: row.name, tagNames: parseTags(row.tag_names), inactiveDays: Number(row.inactive_days),
    sourceCampaignId: row.source_campaign_id,
    engagementBucket: validBuckets.has(row.engagement_bucket) ? (row.engagement_bucket as EngagementBucket) : "",
    engagementDateFrom: row.date_from, engagementDateTo: row.date_to, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export type EmailSegmentInput = { name?: string; tagNames?: string[]; inactiveDays?: number | string; sourceCampaignId?: string; engagementBucket?: string; engagementDateFrom?: string; engagementDateTo?: string };

/** Validates a segment body; an engagement bucket is the trigger for campaign/date refinements, same rule as WhatsApp segments. */
export async function validateEmailSegment(tenantId: string, body: EmailSegmentInput | null): Promise<{ error: string } | { value: EmailSegmentCriteria & { name: string } }> {
  const name = body?.name?.trim() || "";
  if (!name) return { error: "اسم التقسيم مطلوب" };
  const tagNames = Array.isArray(body?.tagNames) ? body!.tagNames!.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim()) : [];
  const inactiveDays = Number(body?.inactiveDays) || 0;
  if (!Number.isInteger(inactiveDays) || inactiveDays < 0) return { error: "عدد أيام عدم التفاعل غير صالح" };
  const bucket = body?.engagementBucket?.trim() || "";
  const sourceCampaignId = body?.sourceCampaignId?.trim() || "";
  const from = body?.engagementDateFrom?.trim() || "";
  const to = body?.engagementDateTo?.trim() || "";
  if (!bucket) {
    if (sourceCampaignId || from || to) return { error: "اختر حالة التفاعل أولًا" };
  } else {
    if (!validBuckets.has(bucket)) return { error: "حالة تفاعل غير صالحة" };
    if ((from && !isoDatePattern.test(from)) || (to && !isoDatePattern.test(to))) return { error: "تنسيق التاريخ غير صالح" };
    if (from && to && from > to) return { error: "تاريخ البداية يجب أن يسبق تاريخ النهاية" };
    if (sourceCampaignId) {
      await ensureEmailPromotionsSchema();
      const found = await prisma.emailCampaign.findFirst({ where: { id: sourceCampaignId, tenantId }, select: { id: true } });
      if (!found) return { error: "الحملة المختارة غير موجودة" };
    }
  }
  return { value: { name, tagNames, inactiveDays, sourceCampaignId: bucket ? sourceCampaignId : "", engagementBucket: bucket as EngagementBucket | "", engagementDateFrom: bucket ? from : "", engagementDateTo: bucket ? to : "" } };
}

function validEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/** Customers (their email is stored in the phone field) that match the criteria. Opt-outs are NOT removed here - the campaign send does that. */
export async function resolveEmailSegmentMembers(tenantId: string, criteria: EmailSegmentCriteria): Promise<EmailSegmentMember[]> {
  await ensureEmailPromotionsSchema();
  const customers = await prisma.customer.findMany({ where: { tenantId }, include: { conversations: { include: { tags: true } } } });

  let engaged: Map<string, string> | null = null;
  if (criteria.engagementBucket) {
    const recipients = await prisma.emailCampaignRecipient.findMany({
      where: {
        tenantId,
        ...(criteria.sourceCampaignId ? { campaignId: criteria.sourceCampaignId } : {}),
        ...(criteria.engagementDateFrom || criteria.engagementDateTo ? { createdAt: { ...(criteria.engagementDateFrom ? { gte: criteria.engagementDateFrom } : {}), ...(criteria.engagementDateTo ? { lte: `${criteria.engagementDateTo}T23:59:59.999Z` } : {}) } } : {})
      }
    });
    const names = new Map((await prisma.emailCampaign.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((campaign) => [campaign.id, campaign.name]));
    engaged = new Map();
    for (const recipient of recipients) {
      if (emailEngagementBucket(recipient) !== criteria.engagementBucket) continue;
      const email = recipient.email.trim().toLowerCase();
      if (!engaged.has(email)) engaged.set(email, names.get(recipient.campaignId) || "");
    }
  }

  const now = new Date();
  const seen = new Set<string>();
  const members: EmailSegmentMember[] = [];
  for (const customer of customers) {
    const email = customer.phone.trim().toLowerCase();
    if (!validEmail(email) || seen.has(email)) continue;
    const tagNames = Array.from(new Set(customer.conversations.flatMap((conversation) => conversation.tags.map((tag) => tag.tagName))));
    if (!matchesAnyTag(tagNames, criteria.tagNames)) continue;
    const latest = customer.conversations.reduce((acc, conversation) => (conversation.lastActivityAt > acc ? conversation.lastActivityAt : acc), "");
    if (criteria.inactiveDays > 0 && !isCustomerInactive(latest, criteria.inactiveDays, now)) continue;
    if (engaged && !engaged.has(email)) continue;
    seen.add(email);
    members.push({ customerId: customer.id, name: customer.name, email, campaignName: engaged?.get(email) || "" });
  }
  return members;
}

export async function getEmailSegmentRow(tenantId: string, id: string) {
  await ensureEmailPromotionsSchema();
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM email_segments WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return rows[0] ? toCriteria(rows[0]) : null;
}

export async function listEmailSegments(tenantId: string): Promise<EmailSegmentRecord[]> {
  await ensureEmailPromotionsSchema();
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM email_segments WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
  const result: EmailSegmentRecord[] = [];
  for (const row of rows) {
    const segment = toCriteria(row);
    result.push({ ...segment, recipientCount: (await resolveEmailSegmentMembers(tenantId, segment)).length });
  }
  return result;
}

export async function saveEmailSegment(tenantId: string, value: EmailSegmentCriteria & { name: string }, id?: string): Promise<string | null> {
  await ensureEmailPromotionsSchema();
  const now = new Date().toISOString();
  const tags = JSON.stringify(value.tagNames);
  if (id) {
    const changed = await prisma.$executeRaw`UPDATE email_segments SET name = ${value.name}, tag_names = ${tags}, inactive_days = ${value.inactiveDays}, source_campaign_id = ${value.sourceCampaignId}, engagement_bucket = ${value.engagementBucket}, date_from = ${value.engagementDateFrom}, date_to = ${value.engagementDateTo}, updated_at = ${now} WHERE id = ${id} AND tenant_id = ${tenantId}`;
    return changed ? id : null;
  }
  const newId = `eseg-${randomUUID()}`;
  await prisma.$executeRaw`INSERT INTO email_segments (id, tenant_id, name, tag_names, inactive_days, source_campaign_id, engagement_bucket, date_from, date_to, created_at, updated_at) VALUES (${newId}, ${tenantId}, ${value.name}, ${tags}, ${value.inactiveDays}, ${value.sourceCampaignId}, ${value.engagementBucket}, ${value.engagementDateFrom}, ${value.engagementDateTo}, ${now}, ${now})`;
  return newId;
}

export async function deleteEmailSegment(tenantId: string, id: string): Promise<boolean> {
  await ensureEmailPromotionsSchema();
  return (await prisma.$executeRaw`DELETE FROM email_segments WHERE id = ${id} AND tenant_id = ${tenantId}`) > 0;
}
