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
  /** The ad's picture (or video poster) when the platform sent one, https only. */
  thumbnailUrl: string;
  mediaType: "image" | "video" | "";
  /** Set when a picture lookup already ran and found nothing (not asked again). */
  pictureLookedUp?: boolean;
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

/** Only https links are kept: the strip renders them as an image. */
function httpsUrl(value: unknown): string {
  const url = str(value, 1500).trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : "";
}

/** Pure: the picture of the ad from a referral object (a video's poster when it has no image). */
export function extractAdMedia(referral: Record<string, unknown> | null | undefined): { thumbnailUrl: string; mediaType: "image" | "video" | "" } {
  if (!referral) return { thumbnailUrl: "", mediaType: "" };
  const declared = str(referral.media_type, 20).toLowerCase();
  const image = httpsUrl(referral.image_url);
  const thumbnail = httpsUrl(referral.thumbnail_url);
  const video = httpsUrl(referral.video_url);
  const mediaType = declared === "video" || (!image && video) ? "video" : image || thumbnail ? "image" : "";
  return { thumbnailUrl: mediaType === "video" ? thumbnail || image : image || thumbnail, mediaType };
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
    raw: safeRaw,
    ...extractAdMedia(referral)
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
    .then(async () => {
      // Added after the table first shipped; a second run finds the column and the error is ignored.
      for (const column of ["thumbnail_url", "media_type"]) {
        await prisma.$executeRawUnsafe(`ALTER TABLE conversation_ad_source ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`).catch(() => undefined);
      }
    })
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

/** Stored when we looked for a picture and the platform has none, so we do not ask again on every open. */
const NO_PICTURE = "none";
const TIKTOK_VIDEO = /^https:\/\/(www\.|m\.|vm\.)?tiktok\.com\/[^\s]*\/video\/\d+/i;
let tiktokCooldownUntil = 0;

/** Pure: the https cover picture out of a TikTok oEmbed response ("" when it has none). */
export function thumbnailFromTikTokOEmbed(payload: unknown): string {
  const url = payload && typeof payload === "object" ? (payload as Record<string, unknown>).thumbnail_url : "";
  return httpsUrl(url);
}

/**
 * TikTok does not send the ad's picture with the WhatsApp message, but when the ad link is a public
 * video link, TikTok's oEmbed gives its cover. Looked up once, the first time the conversation's
 * strip is opened (not in the webhook, so receiving a message never waits on TikTok).
 */
export async function ensureTikTokThumbnail(tenantId: string, conversationId: string, source: AdSource): Promise<AdSource> {
  if (source.platform !== "tiktok" || source.thumbnailUrl || source.pictureLookedUp) return source;
  if (!TIKTOK_VIDEO.test(source.sourceUrl) || Date.now() < tiktokCooldownUntil) return source;
  try {
    const url = new URL("https://www.tiktok.com/oembed");
    url.searchParams.set("url", source.sourceUrl.split("?")[0]);
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
    if (response.status === 429 || response.status >= 500) {
      tiktokCooldownUntil = Date.now() + 5 * 60 * 1000;
      return source;
    }
    const thumbnail = response.ok ? thumbnailFromTikTokOEmbed(await response.json().catch(() => null)) : "";
    await ensureTable();
    await prisma.$executeRaw`UPDATE conversation_ad_source SET thumbnail_url = ${thumbnail || NO_PICTURE}, media_type = ${thumbnail ? "video" : ""} WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId}`;
    return thumbnail ? { ...source, thumbnailUrl: thumbnail, mediaType: "video" } : { ...source, pictureLookedUp: true };
  } catch {
    tiktokCooldownUntil = Date.now() + 60 * 1000;
    return source;
  }
}

type Row = { platform: string; ad_id: string; headline: string; source_url: string; click_id: string; matched_by: string; raw_json: string; thumbnail_url: string; media_type: string; created_at: string };

export async function getAdSource(tenantId: string, conversationId: string): Promise<AdSource | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT platform, ad_id, headline, source_url, click_id, matched_by, raw_json, thumbnail_url, media_type, created_at FROM conversation_ad_source WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId}`;
  const row = rows[0];
  if (!row) return null;
  return { platform: row.platform as AdSource["platform"], adId: row.ad_id, headline: row.headline, sourceUrl: row.source_url, clickId: row.click_id, matchedBy: row.matched_by, raw: row.raw_json, thumbnailUrl: row.thumbnail_url === NO_PICTURE ? "" : row.thumbnail_url || "", pictureLookedUp: row.thumbnail_url === NO_PICTURE, mediaType: row.media_type === "video" ? "video" : row.media_type === "image" ? "image" : "", createdAt: row.created_at };
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
      await prisma.$executeRaw`INSERT INTO conversation_ad_source (conversation_id, tenant_id, platform, ad_id, headline, source_url, click_id, matched_by, raw_json, thumbnail_url, media_type, created_at) VALUES (${input.conversationId}, ${input.tenantId}, ${source.platform}, ${source.adId}, ${source.headline}, ${source.sourceUrl}, ${source.clickId}, ${source.matchedBy}, ${source.raw}, ${source.thumbnailUrl}, ${source.mediaType}, ${now})`;
    } else if (!existing.clickId && source.clickId) {
      await prisma.$executeRaw`UPDATE conversation_ad_source SET click_id = ${source.clickId}, platform = ${source.platform}, matched_by = ${source.matchedBy} WHERE conversation_id = ${input.conversationId} AND tenant_id = ${input.tenantId}`;
    }
  } catch (error) {
    console.error("Ad source capture failed", error);
  }
}
