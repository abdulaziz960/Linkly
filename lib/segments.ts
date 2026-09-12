import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";
import { engagementBucketFor, type EngagementBucket } from "./campaign-engagement";
import type { ParsedRecipient } from "./campaign-engine";

// sourceCampaignId/engagementBucket target customers by how they engaged
// with one past campaign (e.g. "didn't open my last campaign"). Both empty
// together means the condition isn't applied - the two are always set or
// cleared as a pair (enforced at the API layer).
export type SegmentCriteria = { tagNames: string[]; inactiveDays: number; sourceCampaignId: string; engagementBucket: EngagementBucket | "" };

export type SegmentRecord = {
  id: string;
  name: string;
  tagNames: string[];
  inactiveDays: number;
  sourceCampaignId: string;
  engagementBucket: EngagementBucket | "";
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

type SegmentRow = { id: string; name: string; tagNames: string; inactiveDays: number; sourceCampaignId: string; engagementBucket: string; createdAt: string; updatedAt: string };

function toSegmentRecord(row: SegmentRow): SegmentRecord {
  return {
    id: row.id,
    name: row.name,
    tagNames: parseTagNames(row.tagNames),
    inactiveDays: row.inactiveDays,
    sourceCampaignId: row.sourceCampaignId,
    engagementBucket: row.engagementBucket === "notOpened" || row.engagementBucket === "opened" || row.engagementBucket === "clicked" ? row.engagementBucket : "",
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

/**
 * The two engagement-targeting fields are always set or cleared as a pair -
 * a campaign with no bucket (or vice versa) is meaningless input, not a
 * valid "only one condition" state. Also confirms the campaign actually
 * belongs to this tenant, so a segment can never be pointed at another
 * tenant's campaign data.
 */
export async function resolveEngagementFields(tenantId: string, body: { sourceCampaignId?: string; engagementBucket?: string } | null): Promise<{ sourceCampaignId: string; engagementBucket: EngagementBucket | ""; error?: string }> {
  const sourceCampaignId = body?.sourceCampaignId?.trim() || "";
  const engagementBucketRaw = body?.engagementBucket?.trim() || "";
  if (!sourceCampaignId && !engagementBucketRaw) return { sourceCampaignId: "", engagementBucket: "" };
  if (!sourceCampaignId || !engagementBucketRaw) return { sourceCampaignId: "", engagementBucket: "", error: "اختر الحملة وحالة التفاعل معًا" };
  if (!validEngagementBuckets.has(engagementBucketRaw)) return { sourceCampaignId: "", engagementBucket: "", error: "حالة تفاعل غير صالحة" };

  const campaign = await prisma.campaign.findFirst({ where: { id: sourceCampaignId, tenantId } });
  if (!campaign) return { sourceCampaignId: "", engagementBucket: "", error: "الحملة المختارة غير موجودة" };

  return { sourceCampaignId, engagementBucket: engagementBucketRaw as EngagementBucket };
}

type SegmentInput = { name: string; tagNames: string[]; inactiveDays: number; sourceCampaignId: string; engagementBucket: EngagementBucket | "" };

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

/**
 * CampaignRecipient has no customerId - it's only ever matched to a
 * customer by normalized phone, same as everywhere else in this file. Both
 * criteria fields are always set or cleared together (enforced by the
 * segments API), so checking one is enough to know whether to apply this.
 */
async function resolveCampaignEngagementPhones(tenantId: string, criteria: SegmentCriteria): Promise<Set<string> | null> {
  if (!criteria.sourceCampaignId || !criteria.engagementBucket) return null;
  const recipients = await prisma.campaignRecipient.findMany({ where: { tenantId, campaignId: criteria.sourceCampaignId } });
  const matching = new Set<string>();
  for (const recipient of recipients) {
    if (engagementBucketFor(recipient) !== criteria.engagementBucket) continue;
    const phone = normalizeWhatsAppPhone(recipient.phone);
    if (phone) matching.add(phone);
  }
  return matching;
}

export async function resolveSegmentRecipients(tenantId: string, criteria: SegmentCriteria): Promise<ParsedRecipient[]> {
  const [customers, engagementPhones] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId }, include: { conversations: { include: { tags: true } } } }),
    resolveCampaignEngagementPhones(tenantId, criteria)
  ]);

  const now = new Date();
  const recipients: ParsedRecipient[] = [];
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
    if (engagementPhones && !engagementPhones.has(phone)) continue;
    seen.add(phone);
    recipients.push({ phone, name: customer.name });
  }

  return recipients;
}
