import { prisma } from "./prisma";

/**
 * Where a conversation came from: the ad (Meta click-to-WhatsApp, TikTok...) that
 * opened it. Captured from the first inbound WhatsApp message and shown in the
 * conversation, and used to attach the TikTok click id to lead-status events.
 *
 * Meta passes a `referral` object with the message. For TikTok it is not
 * documented what reaches WhatsApp, so the first message's non-personal fields are
 * also kept raw (`raw_json`) - that is how we learn what an ad really sends.
 */

export type AdSource = {
  platform: "meta" | "tiktok" | "unknown";
  adId: string;
  headline: string;
  sourceUrl: string;
  clickId: string;
  matchedBy: string;
  raw: string;
  createdAt: string;
};

const TTCLID = /[?&]ttclid=([A-Za-z0-9_.\-~]{6,200})/i;

type WhatsAppMessage = {
  type?: string;
  text?: { body?: string };
  referral?: Record<string, unknown>;
  context?: Record<string, unknown>;
  button?: Record<string, unknown>;
};

function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Pure: reads the ad source out of an inbound WhatsApp message payload (null when it carries none). */
export function extractAdSource(message: WhatsAppMessage): Omit<AdSource, "createdAt"> | null {
  const referral = message.referral && typeof message.referral === "object" ? message.referral : null;
  const text = message.text?.body ?? "";
  const sourceUrl = str(referral?.source_url, 800);

  const tiktokClick = TTCLID.exec(sourceUrl)?.[1] ?? TTCLID.exec(text)?.[1] ?? "";
  const metaClick = str(referral?.ctwa_clid, 400);
  const isTikTokUrl = /(^|\.)tiktok\.com/i.test(sourceUrl.replace(/^https?:\/\//i, "").split("/")[0] ?? "");

  if (!referral && !tiktokClick) return null;

  const platform: AdSource["platform"] = tiktokClick || isTikTokUrl ? "tiktok" : metaClick || referral?.source_type ? "meta" : "unknown";
  const safeRaw = referral ? JSON.stringify({ referral }).slice(0, 2000) : "";
  return {
    platform,
    adId: str(referral?.source_id, 200),
    headline: str(referral?.headline, 300),
    sourceUrl,
    clickId: tiktokClick || metaClick,
    matchedBy: tiktokClick ? (TTCLID.test(sourceUrl) ? "referral.source_url" : "text") : referral ? "referral" : "",
    raw: safeRaw
  };
}

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS conversation_ad_source (
      conversation_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'unknown',
      ad_id TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      click_id TEXT NOT NULL DEFAULT '',
      matched_by TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

type Row = { platform: string; ad_id: string; headline: string; source_url: string; click_id: string; matched_by: string; raw_json: string; created_at: string };

export async function getAdSource(tenantId: string, conversationId: string): Promise<AdSource | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT platform, ad_id, headline, source_url, click_id, matched_by, raw_json, created_at FROM conversation_ad_source WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId}`;
  const row = rows[0];
  if (!row) return null;
  return { platform: row.platform as AdSource["platform"], adId: row.ad_id, headline: row.headline, sourceUrl: row.source_url, clickId: row.click_id, matchedBy: row.matched_by, raw: row.raw_json, createdAt: row.created_at };
}

/**
 * Remembers the ad that opened a conversation. The first message that carries an
 * ad source wins; a later one only fills in a click id that was missing.
 * Never throws - a failure here must not affect receiving the message.
 */
export async function captureAdSource(input: { tenantId: string; conversationId: string; message: WhatsAppMessage }): Promise<void> {
  try {
    const source = extractAdSource(input.message);
    if (!source) return;
    await ensureTable();
    const existing = await getAdSource(input.tenantId, input.conversationId);
    const now = new Date().toISOString();
    if (!existing) {
      await prisma.$executeRaw`INSERT INTO conversation_ad_source (conversation_id, tenant_id, platform, ad_id, headline, source_url, click_id, matched_by, raw_json, created_at) VALUES (${input.conversationId}, ${input.tenantId}, ${source.platform}, ${source.adId}, ${source.headline}, ${source.sourceUrl}, ${source.clickId}, ${source.matchedBy}, ${source.raw}, ${now})`;
    } else if (!existing.clickId && source.clickId) {
      await prisma.$executeRaw`UPDATE conversation_ad_source SET click_id = ${source.clickId}, platform = ${source.platform}, matched_by = ${source.matchedBy} WHERE conversation_id = ${input.conversationId} AND tenant_id = ${input.tenantId}`;
    }
  } catch (error) {
    console.error("Ad source capture failed", error);
  }
}
