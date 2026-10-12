import { randomBytes } from "crypto";
import { getIntegrationSettings } from "./database";
import { prisma } from "./prisma";

/**
 * WhatsApp tracking links for ads (Snapchat, TikTok, Google...). The ad's destination is
 * <app>/api/w/<code>; opening it records the click (with the platform's click id: ScCid / ttclid / gclid)
 * and sends the visitor to the workspace's WhatsApp with the message pre-filled plus an invisible
 * [REF:<id>] marker. When that message arrives, the conversation is attributed to the click, so it
 * shows its source above the messages and its stage events can be matched with the click id.
 */

export const WA_LINK_PAGE_ID = "wa-link";
export const WA_LINK_PLATFORMS = ["snapchat", "tiktok", "google", "meta", "other"] as const;
export type WaLinkPlatform = (typeof WA_LINK_PLATFORMS)[number];

export type WaLink = {
  code: string;
  name: string;
  platform: WaLinkPlatform;
  campaign: string;
  message: string;
  createdAt: string;
  clicks: number;
  conversations: number;
};

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS wa_tracking_links (
      code TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'other',
      campaign TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

type Row = { code: string; tenant_id: string; name: string; platform: string; campaign: string; message: string; active: number; created_at: string };

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f​]/g, "").trim().slice(0, max) : "";
}

export function normalizeWaLinkInput(input: { name?: unknown; platform?: unknown; campaign?: unknown; message?: unknown }): { ok: true; data: { name: string; platform: WaLinkPlatform; campaign: string; message: string } } | { ok: false; error: string } {
  const name = clean(input.name, 80);
  if (!name) return { ok: false, error: "اكتب اسمًا للرابط" };
  const platform = (WA_LINK_PLATFORMS as readonly string[]).includes(String(input.platform)) ? (input.platform as WaLinkPlatform) : "other";
  const message = clean(input.message, 500) || "السلام عليكم، أبغى أستفسر";
  return { ok: true, data: { name, platform, campaign: clean(input.campaign, 120), message } };
}

export async function createWaLink(tenantId: string, input: { name: string; platform: WaLinkPlatform; campaign: string; message: string }): Promise<WaLink> {
  await ensureTable();
  const code = randomBytes(5).toString("base64url").replace(/[^A-Za-z0-9]/g, "x").slice(0, 7).toLowerCase();
  const createdAt = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO wa_tracking_links (code, tenant_id, name, platform, campaign, message, active, created_at) VALUES (${code}, ${tenantId}, ${input.name}, ${input.platform}, ${input.campaign}, ${input.message}, 1, ${createdAt})`;
  return { code, ...input, createdAt, clicks: 0, conversations: 0 };
}

export async function getWaLinkByCode(code: string): Promise<(WaLink & { tenantId: string }) | null> {
  if (!/^[a-z0-9]{4,16}$/.test(code)) return null;
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT code, tenant_id, name, platform, campaign, message, active, created_at FROM wa_tracking_links WHERE code = ${code} AND active = 1 LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return { code: row.code, tenantId: row.tenant_id, name: row.name, platform: row.platform as WaLinkPlatform, campaign: row.campaign, message: row.message, createdAt: row.created_at, clicks: 0, conversations: 0 };
}

export async function listWaLinks(tenantId: string): Promise<WaLink[]> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT code, tenant_id, name, platform, campaign, message, active, created_at FROM wa_tracking_links WHERE tenant_id = ${tenantId} AND active = 1 ORDER BY created_at DESC`;
  if (!rows.length) return [];
  const [clicks, conversations] = await Promise.all([
    prisma.linkClick.groupBy({ by: ["linkId"], where: { tenantId, pageId: WA_LINK_PAGE_ID }, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ["attrLinkId"], where: { tenantId, attrPageId: WA_LINK_PAGE_ID }, _count: { _all: true } })
  ]);
  const clickCount = new Map(clicks.map((item) => [item.linkId, item._count._all]));
  const conversationCount = new Map(conversations.map((item) => [item.attrLinkId, item._count._all]));
  return rows.map((row) => ({
    code: row.code, name: row.name, platform: row.platform as WaLinkPlatform, campaign: row.campaign, message: row.message, createdAt: row.created_at,
    clicks: clickCount.get(row.code) ?? 0, conversations: conversationCount.get(row.code) ?? 0
  }));
}

export async function deleteWaLink(tenantId: string, code: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`UPDATE wa_tracking_links SET active = 0 WHERE code = ${code} AND tenant_id = ${tenantId}`;
}

/** The platform's click id and which platform it implies, from the ad click's query string. */
export function clickIdFromQuery(params: URLSearchParams): { clickId: string; platform: WaLinkPlatform | "" } {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = params.get(key)?.trim();
      if (value) return value.slice(0, 200);
    }
    return "";
  };
  const sc = pick("ScCid", "sc_click_id");
  if (sc) return { clickId: sc, platform: "snapchat" };
  const tt = pick("ttclid");
  if (tt) return { clickId: tt, platform: "tiktok" };
  const g = pick("gclid", "gbraid", "wbraid");
  if (g) return { clickId: g, platform: "google" };
  const generic = pick("click_id", "clickid");
  return { clickId: generic, platform: "" };
}

/** The workspace's WhatsApp number in digits (what wa.me needs), or "". */
export async function workspaceWhatsappDigits(tenantId: string): Promise<string> {
  const settings = await getIntegrationSettings("whatsapp", tenantId);
  const digits = (settings.phoneNumber || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

/** wa.me URL with the pre-filled message and the invisible click marker the WhatsApp inbox reads back. */
export function whatsappUrl(digits: string, message: string, clickRef: string): string {
  const text = clickRef ? `${message}\n​[REF:${clickRef}]` : message;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * After a message from a tracking-link click created its conversation, shows that link's platform and
 * campaign as the conversation's ad source (with the click id), unless a source was already captured.
 * Never throws.
 */
export async function captureLinkAdSource(input: { tenantId: string; conversationId: string }): Promise<void> {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId, attrPageId: WA_LINK_PAGE_ID },
      select: { attrLinkId: true, attrButtonId: true }
    });
    if (!conversation) return;
    const link = await getWaLinkByCode(conversation.attrLinkId);
    if (!link) return;
    const { getAdSource, recordLinkAdSource } = await import("./ad-source");
    if (await getAdSource(input.tenantId, input.conversationId)) return;
    const clickId = conversation.attrButtonId && conversation.attrButtonId !== link.code ? conversation.attrButtonId : "";
    await recordLinkAdSource({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      platform: link.platform === "other" ? "unknown" : link.platform,
      headline: link.campaign || link.name,
      clickId
    });
  } catch (error) {
    console.error("Tracking link source failed", error);
  }
}
