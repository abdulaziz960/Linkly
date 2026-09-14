import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";
import { engagementBucketFor, type EngagementBucket } from "./campaign-engagement";
import type { ParsedRecipient } from "./campaign-engine";

// engagementBucket is the trigger for campaign-engagement targeting -
// empty means the condition isn't applied at all. When set, sourceCampaignId
// optionally narrows to one campaign (empty = every campaign) and the two
// dates optionally narrow to recipients sent within that range (empty =
// unbounded on that side). All enforced together at the API layer.
export type SegmentCriteria = {
  tagNames: string[];
  inactiveDays: number;
  sourceCampaignId: string;
  engagementBucket: EngagementBucket | "";
  engagementDateFrom: string;
  engagementDateTo: string;
};

export type SegmentRecord = {
  id: string;
  name: string;
  tagNames: string[];
  inactiveDays: number;
  sourceCampaignId: string;
  engagementBucket: EngagementBucket | "";
  engagementDateFrom: string;
  engagementDateTo: string;
  createdAt: string;
  updatedAt: string;
};

function parseTagNames(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

type SegmentRow = { id: string; name: string; tagNames: string; inactiveDays: number; sourceCampaignId: string; engagementBucket: string; engagementDateFrom: string; engagementDateTo: string; createdAt: string; updatedAt: string };

function toSegmentRecord(row: SegmentRow): SegmentRecord {
  return {
    id: row.id,
    name: row.name,
    tagNames: parseTagNames(row.tagNames),
    inactiveDays: row.inactiveDays,
    sourceCampaignId: row.sourceCampaignId,
    engagementBucket: row.engagementBucket === "notOpened" || row.engagementBucket === "opened" || row.engagementBucket === "clicked" ? row.engagementBucket : "",
    engagementDateFrom: row.engagementDateFrom,
    engagementDateTo: row.engagementDateTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function getSegments(tenantId: string): Promise<SegmentRecord[]> {
  const rows = await prisma.segment.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  return rows.map(toSegmentRecord);
}

export async function getSegmentById(tenantId: string, id: string): Promise<SegmentRecord | null> {
  const row = await prisma.segment.findFirst({ where: { id, tenantId } });
  return row ? toSegmentRecord(row) : null;
}

const validEngagementBuckets = new Set(["notOpened", "opened", "clicked"]);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

type EngagementFieldsInput = { sourceCampaignId?: string; engagementBucket?: string; engagementDateFrom?: string; engagementDateTo?: string };
type EngagementFieldsResult = { sourceCampaignId: string; engagementBucket: EngagementBucket | ""; engagementDateFrom: string; engagementDateTo: string; error?: string };

/**
 * engagementBucket is the trigger for the whole condition - empty clears
 * everything else too, since a leftover campaign/date with no bucket is
 * meaningless. When a bucket IS set, sourceCampaignId and the two dates are
 * each independently optional refinements (empty = unbounded on that side).
 * Confirms a given campaign actually belongs to this tenant, so a segment
 * can never be pointed at another tenant's campaign data.
 */
export async function resolveEngagementFields(tenantId: string, body: EngagementFieldsInput | null): Promise<EngagementFieldsResult> {
  const empty = { sourceCampaignId: "", engagementBucket: "" as const, engagementDateFrom: "", engagementDateTo: "" };
  const sourceCampaignId = body?.sourceCampaignId?.trim() || "";
  const engagementBucketRaw = body?.engagementBucket?.trim() || "";
  const engagementDateFrom = body?.engagementDateFrom?.trim() || "";
  const engagementDateTo = body?.engagementDateTo?.trim() || "";

  if (!engagementBucketRaw) {
    if (sourceCampaignId || engagementDateFrom || engagementDateTo) return { ...empty, error: "اختر حالة التفاعل أولًا" };
    return empty;
  }
  if (!validEngagementBuckets.has(engagementBucketRaw)) return { ...empty, error: "حالة تفاعل غير صالحة" };
  if (engagementDateFrom && !isoDatePattern.test(engagementDateFrom)) return { ...empty, error: "تنسيق تاريخ البداية غير صالح" };
  if (engagementDateTo && !isoDatePattern.test(engagementDateTo)) return { ...empty, error: "تنسيق تاريخ النهاية غير صالح" };
  if (engagementDateFrom && engagementDateTo && engagementDateFrom > engagementDateTo) return { ...empty, error: "تاريخ البداية يجب أن يسبق تاريخ النهاية" };

  if (sourceCampaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: sourceCampaignId, tenantId } });
    if (!campaign) return { ...empty, error: "الحملة المختارة غير موجودة" };
  }

  return { sourceCampaignId, engagementBucket: engagementBucketRaw as EngagementBucket, engagementDateFrom, engagementDateTo };
}

type SegmentInput = { name: string; tagNames: string[]; inactiveDays: number; sourceCampaignId: string; engagementBucket: EngagementBucket | ""; engagementDateFrom: string; engagementDateTo: string };

export async function createSegment(tenantId: string, input: SegmentInput): Promise<SegmentRecord> {
  const now = new Date().toISOString();
  const row = await prisma.segment.create({
    data: {
      id: `seg-${randomUUID()}`,
      tenantId,
      name: input.name,
      tagNames: JSON.stringify(input.tagNames),
      inactiveDays: input.inactiveDays,
      sourceCampaignId: input.sourceCampaignId,
      engagementBucket: input.engagementBucket,
      engagementDateFrom: input.engagementDateFrom,
      engagementDateTo: input.engagementDateTo,
      createdAt: now,
      updatedAt: now
    }
  });
  return toSegmentRecord(row);
}

export async function updateSegment(tenantId: string, id: string, input: SegmentInput): Promise<SegmentRecord | null> {
  const existing = await prisma.segment.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  const row = await prisma.segment.update({
    where: { id },
    data: {
      name: input.name,
      tagNames: JSON.stringify(input.tagNames),
      inactiveDays: input.inactiveDays,
      sourceCampaignId: input.sourceCampaignId,
      engagementBucket: input.engagementBucket,
      engagementDateFrom: input.engagementDateFrom,
      engagementDateTo: input.engagementDateTo,
      updatedAt: new Date().toISOString()
    }
  });
  return toSegmentRecord(row);
}

export async function deleteSegment(tenantId: string, id: string): Promise<boolean> {
  const existing = await prisma.segment.findFirst({ where: { id, tenantId } });
  if (!existing) return false;
  await prisma.segment.delete({ where: { id } });
  return true;
}

/**
 * A customer's tags/activity are aggregates across all of its conversations
 * (a customer can have several - one per connected channel), so both checks
 * below look across the whole set rather than a single conversation.
 */
export function matchesAnyTag(customerTagNames: string[], filterTagNames: string[]): boolean {
  if (!filterTagNames.length) return true;
  return customerTagNames.some((tagName) => filterTagNames.includes(tagName));
}

/**
 * lastActivityAt defaults to "" for a conversation that never had activity
 * recorded - treated as "always inactive" rather than excluded, since a
 * customer who has never interacted certainly hasn't interacted recently.
 */
export function isCustomerInactive(mostRecentActivityAt: string, inactiveDays: number, now: Date = new Date()): boolean {
  if (inactiveDays <= 0) return true;
  if (!mostRecentActivityAt) return true;
  const cutoff = new Date(now.getTime() - inactiveDays * 24 * 60 * 60 * 1000).toISOString();
  return mostRecentActivityAt < cutoff;
}

/** sentAt is only ever set on a successfully-sent recipient row, as a plain ISO string - lexicographic comparison works fine for the range bounds. */
function sentAtRangeWhere(dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return {};
  return {
    sentAt: {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: `${dateTo}T23:59:59.999Z` } : {})
    }
  };
}

/**
 * CampaignRecipient has no customerId - it's only ever matched to a
 * customer by normalized phone, same as everywhere else in this file.
 * engagementBucket being empty means the whole condition is off (enforced
 * by resolveEngagementFields); sourceCampaignId and the two dates are each
 * independently optional beyond that. Maps each matching phone to the name
 * of whichever campaign produced the match (first one found is kept - a
 * phone can only appear more than once here when sourceCampaignId is empty
 * and it matched the bucket in more than one campaign).
 */
async function resolveCampaignEngagementMatches(tenantId: string, criteria: SegmentCriteria): Promise<Map<string, string> | null> {
  if (!criteria.engagementBucket) return null;
  const recipients = await prisma.campaignRecipient.findMany({
    where: {
      tenantId,
      ...(criteria.sourceCampaignId ? { campaignId: criteria.sourceCampaignId } : {}),
      ...sentAtRangeWhere(criteria.engagementDateFrom, criteria.engagementDateTo)
    }
  });
  const campaignIds = Array.from(new Set(recipients.map((recipient) => recipient.campaignId)));
  const campaignNames = new Map((await prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } })).map((campaign) => [campaign.id, campaign.name]));

  const matches = new Map<string, string>();
  for (const recipient of recipients) {
    if (engagementBucketFor(recipient) !== criteria.engagementBucket) continue;
    const phone = normalizeWhatsAppPhone(recipient.phone);
    if (phone && !matches.has(phone)) matches.set(phone, campaignNames.get(recipient.campaignId) || "");
  }
  return matches;
}

export type CrossCampaignEngagementRow = { name: string; phone: string; campaignName: string };
export type CrossCampaignEngagementResult = {
  counts: Record<EngagementBucket, number>;
  rows: Record<EngagementBucket, CrossCampaignEngagementRow[]>;
};

/**
 * The all-customers, cross-campaign breakdown shown on the Segments page.
 * A customer can appear in several campaigns with different outcomes, so
 * each phone is counted once under its single best engagement
 * (clicked > opened > notOpened) rather than once per campaign - campaignName
 * reflects whichever campaign produced that winning engagement.
 */
export async function getCrossCampaignEngagement(tenantId: string, dateFrom: string, dateTo: string): Promise<CrossCampaignEngagementResult> {
  const recipients = await prisma.campaignRecipient.findMany({
    where: { tenantId, ...sentAtRangeWhere(dateFrom, dateTo) }
  });
  const campaignNames = new Map((await prisma.campaign.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((campaign) => [campaign.id, campaign.name]));

  const bucketRank: Record<EngagementBucket, number> = { clicked: 3, opened: 2, notOpened: 1 };
  const bestByPhone = new Map<string, { bucket: EngagementBucket; name: string; campaignName: string }>();
  for (const recipient of recipients) {
    const bucket = engagementBucketFor(recipient);
    if (!bucket) continue;
    const phone = normalizeWhatsAppPhone(recipient.phone);
    if (!phone) continue;
    const existing = bestByPhone.get(phone);
    if (!existing || bucketRank[bucket] > bucketRank[existing.bucket]) {
      bestByPhone.set(phone, { bucket, name: recipient.name, campaignName: campaignNames.get(recipient.campaignId) || "" });
    }
  }

  const counts: Record<EngagementBucket, number> = { notOpened: 0, opened: 0, clicked: 0 };
  const rows: Record<EngagementBucket, CrossCampaignEngagementRow[]> = { notOpened: [], opened: [], clicked: [] };
  for (const [phone, { bucket, name, campaignName }] of bestByPhone) {
    counts[bucket] += 1;
    rows[bucket].push({ name, phone, campaignName });
  }
  return { counts, rows };
}

export async function resolveSegmentRecipients(tenantId: string, criteria: SegmentCriteria): Promise<ParsedRecipient[]> {
  const details = await getSegmentRecipientDetails(tenantId, criteria);
  return details.map((row) => ({ phone: row.phone, name: row.name }));
}

export type SegmentRecipientDetail = { name: string; phone: string; campaignName: string };

/** Same matching as resolveSegmentRecipients, plus which campaign (if any) produced each row's engagement match - "" for a segment with no campaign-engagement condition, or a phone matched only by tags/inactivity. */
export async function getSegmentRecipientDetails(tenantId: string, criteria: SegmentCriteria): Promise<SegmentRecipientDetail[]> {
  const [customers, engagementMatches] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId }, include: { conversations: { include: { tags: true } } } }),
    resolveCampaignEngagementMatches(tenantId, criteria)
  ]);

  const now = new Date();
  const recipients: SegmentRecipientDetail[] = [];
  const seen = new Set<string>();

  for (const customer of customers) {
    const customerTagNames = Array.from(new Set(customer.conversations.flatMap((conversation) => conversation.tags.map((tag) => tag.tagName))));
    if (!matchesAnyTag(customerTagNames, criteria.tagNames)) continue;

    const mostRecentActivityAt = customer.conversations.reduce((latest, conversation) => (
      conversation.lastActivityAt > latest ? conversation.lastActivityAt : latest
    ), "");
    if (criteria.inactiveDays > 0 && !isCustomerInactive(mostRecentActivityAt, criteria.inactiveDays, now)) continue;

    const phone = normalizeWhatsAppPhone(customer.phone);
    if (!phone || seen.has(phone)) continue;
    if (engagementMatches && !engagementMatches.has(phone)) continue;
    seen.add(phone);
    recipients.push({ phone, name: customer.name, campaignName: engagementMatches?.get(phone) || "" });
  }

  return recipients;
}
