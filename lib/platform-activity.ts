import { prisma } from "./prisma";
import { getAdSource } from "./ad-source";
import { recentMetaEvents } from "./meta-events";
import { recentSnapEvents } from "./snap-events";
import { recentEvents as recentTikTokEvents } from "./tiktok-events";

export type AdPlatform = "meta" | "snapchat" | "tiktok";
export type ActivityRange = "24h" | "7d" | "30d" | "all";

export function parsePlatform(value: string | null): AdPlatform | null {
  return value === "meta" || value === "snapchat" || value === "tiktok" ? value : null;
}

export function parseRange(value: string | null): ActivityRange {
  return value === "24h" || value === "7d" || value === "30d" ? value : "all";
}

function cutoff(range: ActivityRange): string {
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : range === "30d" ? 24 * 30 : 0;
  return hours ? new Date(Date.now() - hours * 3600_000).toISOString() : "";
}

/** The tables are created lazily by their own modules; touching them first makes the joins below safe on a fresh database. */
async function ensureTables(tenantId: string) {
  await Promise.all([getAdSource(tenantId, "none"), recentMetaEvents(tenantId, 1), recentSnapEvents(tenantId, 1), recentTikTokEvents(tenantId, 1)]);
}

export type PlatformLead = { conversationId: string; name: string; phone: string; stage: string; source: string; campaign: string; createdAt: string };

/** Customers whose conversation came from the platform's ads (lead forms, click-to-WhatsApp, tracking links). */
export async function listPlatformLeads(tenantId: string, platform: AdPlatform, range: ActivityRange, limit = 500): Promise<PlatformLead[]> {
  await ensureTables(tenantId);
  const since = cutoff(range);
  const rows = await prisma.$queryRaw<Array<{ conversation_id: string; name: string; phone: string; pipeline_stage: string; matched_by: string; headline: string; created_at: string }>>`
    SELECT s.conversation_id, cu.name, cu.phone, c.pipeline_stage, s.matched_by, s.headline, s.created_at
    FROM conversation_ad_source s
    JOIN conversations c ON c.id = s.conversation_id AND c.tenant_id = s.tenant_id
    JOIN customers cu ON cu.id = c.customer_id
    WHERE s.tenant_id = ${tenantId} AND s.platform = ${platform} AND s.created_at >= ${since}
    ORDER BY s.created_at DESC LIMIT ${limit}`;
  return rows.map((row) => ({ conversationId: row.conversation_id, name: row.name, phone: row.phone, stage: row.pipeline_stage, source: row.matched_by, campaign: row.headline, createdAt: row.created_at }));
}

export type PlatformEvent = { conversationId: string; name: string; phone: string; stage: string; eventName: string; ok: boolean; message: string; createdAt: string };

/** Conversion events Linkly sent back to the platform, newest first. */
type EventRow = { conversation_id: string; name: string | null; phone: string | null; status: string; event_name: string; ok: number; message: string; created_at: string };

export async function listPlatformEvents(tenantId: string, platform: AdPlatform, range: ActivityRange, limit = 500): Promise<PlatformEvent[]> {
  await ensureTables(tenantId);
  const since = cutoff(range);
  // One tagged query per platform: table names can't be bound, and $queryRawUnsafe placeholders differ between SQLite and Postgres.
  const rows: EventRow[] = platform === "meta"
    ? await prisma.$queryRaw<EventRow[]>`SELECT e.conversation_id, cu.name, cu.phone, e.status, e.event_name, e.ok, e.message, e.created_at FROM meta_event_log e LEFT JOIN conversations c ON c.id = e.conversation_id AND c.tenant_id = e.tenant_id LEFT JOIN customers cu ON cu.id = c.customer_id WHERE e.tenant_id = ${tenantId} AND e.created_at >= ${since} ORDER BY e.created_at DESC LIMIT ${limit}`
    : platform === "snapchat"
      ? await prisma.$queryRaw<EventRow[]>`SELECT e.conversation_id, cu.name, cu.phone, e.status, e.event_name, e.ok, e.message, e.created_at FROM snap_event_log e LEFT JOIN conversations c ON c.id = e.conversation_id AND c.tenant_id = e.tenant_id LEFT JOIN customers cu ON cu.id = c.customer_id WHERE e.tenant_id = ${tenantId} AND e.created_at >= ${since} ORDER BY e.created_at DESC LIMIT ${limit}`
      : await prisma.$queryRaw<EventRow[]>`SELECT e.conversation_id, cu.name, cu.phone, e.status, e.event_name, e.ok, e.message, e.created_at FROM tiktok_event_log e LEFT JOIN conversations c ON c.id = e.conversation_id AND c.tenant_id = e.tenant_id LEFT JOIN customers cu ON cu.id = c.customer_id WHERE e.tenant_id = ${tenantId} AND e.created_at >= ${since} ORDER BY e.created_at DESC LIMIT ${limit}`;
  return rows.map((row) => ({ conversationId: row.conversation_id, name: row.name || "", phone: row.phone || "", stage: row.status, eventName: row.event_name, ok: Boolean(row.ok), message: row.message, createdAt: row.created_at }));
}
