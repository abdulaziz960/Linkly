import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { normalizeWhatsAppPhone } from "./whatsapp-inbox";
import type { ParsedRecipient } from "./campaign-engine";

export type SegmentCriteria = { tagNames: string[]; inactiveDays: number };

export type SegmentRecord = {
  id: string;
  name: string;
  tagNames: string[];
  inactiveDays: number;
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

function toSegmentRecord(row: { id: string; name: string; tagNames: string; inactiveDays: number; createdAt: string; updatedAt: string }): SegmentRecord {
  return {
    id: row.id,
    name: row.name,
    tagNames: parseTagNames(row.tagNames),
    inactiveDays: row.inactiveDays,
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

export async function createSegment(tenantId: string, input: { name: string; tagNames: string[]; inactiveDays: number }): Promise<SegmentRecord> {
  const now = new Date().toISOString();
  const row = await prisma.segment.create({
    data: {
      id: `seg-${randomUUID()}`,
      tenantId,
      name: input.name,
      tagNames: JSON.stringify(input.tagNames),
      inactiveDays: input.inactiveDays,
      createdAt: now,
      updatedAt: now
    }
  });
  return toSegmentRecord(row);
}

export async function updateSegment(tenantId: string, id: string, input: { name: string; tagNames: string[]; inactiveDays: number }): Promise<SegmentRecord | null> {
  const existing = await prisma.segment.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  const row = await prisma.segment.update({
    where: { id },
    data: {
      name: input.name,
      tagNames: JSON.stringify(input.tagNames),
      inactiveDays: input.inactiveDays,
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

export async function resolveSegmentRecipients(tenantId: string, criteria: SegmentCriteria): Promise<ParsedRecipient[]> {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    include: { conversations: { include: { tags: true } } }
  });

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
    seen.add(phone);
    recipients.push({ phone, name: customer.name });
  }

  return recipients;
}
