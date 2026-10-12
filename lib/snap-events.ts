import { createHash } from "crypto";
import { pipelineStages } from "../app/dashboard/types";
import { getAdSource } from "./ad-source";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-storage";

/**
 * Snapchat Ads <-> conversation stage.
 *
 * When a conversation changes stage, the mapped event is sent to the workspace's Snap
 * Pixel through the Snap Conversions API, with the customer's phone hashed (SHA-256)
 * and the Snap click id (ScCid) when the conversation carried one. Same shape as the
 * TikTok and Meta features: two small tables created on first use, no Prisma model.
 *
 * The workspace enters its Pixel ID and a Conversions API token from Snap's Events Manager.
 */

export const SNAP_API_BASE = "https://tr.snapchat.com/v3";

export const SNAP_STAGES = pipelineStages;
export type SnapStage = (typeof SNAP_STAGES)[number];
/** stage -> Snap event name ("" = send nothing). Snap has no LEAD event; SIGN_UP is its closest standard one. */
export type SnapMapping = Record<SnapStage, string>;
export const DEFAULT_SNAP_MAPPING: SnapMapping = { "جديد": "", "مهتم": "", "مؤهل": "SIGN_UP", "عرض سعر": "", "تم الحجز": "", "فاز": "PURCHASE", "خسر": "" };

export const SNAP_ACTION_SOURCES = ["WEB", "OFFLINE"] as const;
const EVENT_NAME = /^[A-Z][A-Z0-9_]{1,39}$/;
const PIXEL_ID = /^[A-Za-z0-9-]{8,64}$/;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS snap_ads_settings (
      tenant_id TEXT PRIMARY KEY,
      pixel_id TEXT NOT NULL DEFAULT '',
      access_token_enc TEXT NOT NULL DEFAULT '',
      action_source TEXT NOT NULL DEFAULT 'WEB',
      enabled INTEGER NOT NULL DEFAULT 0,
      mapping_json TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE snap_ads_settings ADD COLUMN send_all INTEGER NOT NULL DEFAULT 0`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS snap_event_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_id TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0,
      http_status INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

type Row = { pixel_id: string; access_token_enc: string; action_source: string; enabled: number; send_all: number; mapping_json: string; updated_at: string };

export type SnapAdsSettings = {
  pixelId: string;
  hasToken: boolean;
  actionSource: string;
  enabled: boolean;
  /** Send for every conversation (matched by phone), not only the ones that came from an ad. Off by default. */
  sendAll: boolean;
  mapping: SnapMapping;
  updatedAt: string;
};

function parseMapping(json: string): SnapMapping {
  const mapping: SnapMapping = { ...DEFAULT_SNAP_MAPPING };
  try {
    const parsed = JSON.parse(json || "{}") as Record<string, unknown>;
    for (const stage of SNAP_STAGES) {
      const value = parsed[stage];
      if (typeof value === "string" && (value === "" || EVENT_NAME.test(value))) mapping[stage] = value;
    }
  } catch {
    // keep defaults
  }
  return mapping;
}

async function readRow(tenantId: string): Promise<Row | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Row[]>`SELECT pixel_id, access_token_enc, action_source, enabled, send_all, mapping_json, updated_at FROM snap_ads_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  return rows[0] ?? null;
}

/** Settings for the screen: the token is never returned, only whether one is saved. */
export async function getSnapAdsSettings(tenantId: string): Promise<SnapAdsSettings> {
  const row = await readRow(tenantId);
  return {
    pixelId: row?.pixel_id ?? "",
    hasToken: Boolean(row?.access_token_enc),
    actionSource: row?.action_source || "WEB",
    enabled: row?.enabled === 1,
    sendAll: row?.send_all === 1,
    mapping: parseMapping(row?.mapping_json ?? ""),
    updatedAt: row?.updated_at ?? ""
  };
}

export type SnapSettingsInput = { pixelId?: unknown; accessToken?: unknown; actionSource?: unknown; enabled?: unknown; sendAll?: unknown; mapping?: unknown };
type CleanData = { pixelId?: string; accessToken?: string; actionSource?: string; enabled?: boolean; sendAll?: boolean; mapping?: SnapMapping };

export function cleanSnapSettingsInput(input: SnapSettingsInput): { ok: true; data: CleanData } | { ok: false; error: string } {
  const data: CleanData = {};
  if (input.pixelId !== undefined) {
    const value = typeof input.pixelId === "string" ? input.pixelId.trim() : "";
    if (value && !PIXEL_ID.test(value)) return { ok: false, error: "معرّف Snap Pixel غير صالح" };
    data.pixelId = value;
  }
  if (typeof input.accessToken === "string" && input.accessToken.trim()) {
    const token = input.accessToken.trim();
    if (token.length < 20 || token.length > 4000 || /\s/.test(token)) return { ok: false, error: "رمز الوصول (Conversions API token) غير صالح" };
    data.accessToken = token;
  }
  if (input.actionSource !== undefined) {
    if (typeof input.actionSource !== "string" || !(SNAP_ACTION_SOURCES as readonly string[]).includes(input.actionSource)) return { ok: false, error: "مصدر الحدث غير صالح" };
    data.actionSource = input.actionSource;
  }
  if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
  if (input.sendAll !== undefined) data.sendAll = Boolean(input.sendAll);
  if (input.mapping !== undefined) {
    if (typeof input.mapping !== "object" || input.mapping === null) return { ok: false, error: "ربط المراحل غير صالح" };
    const mapping = { ...DEFAULT_SNAP_MAPPING };
    for (const stage of SNAP_STAGES) {
      const value = (input.mapping as Record<string, unknown>)[stage];
      if (value === undefined) continue;
      const clean = typeof value === "string" ? value.trim().toUpperCase() : "";
      if (typeof value !== "string" || (clean !== "" && !EVENT_NAME.test(clean))) return { ok: false, error: `اسم الحدث للمرحلة «${stage}» غير صالح (حروف إنجليزية كبيرة وشرطة سفلية، مثل PURCHASE)` };
      mapping[stage] = clean;
    }
    data.mapping = mapping;
  }
  return { ok: true, data };
}

export async function saveSnapAdsSettings(tenantId: string, data: CleanData): Promise<SnapAdsSettings> {
  await ensureTables();
  const existing = await readRow(tenantId);
  const next = {
    pixelId: data.pixelId ?? existing?.pixel_id ?? "",
    token: data.accessToken ? encryptSecret(data.accessToken) : existing?.access_token_enc ?? "",
    actionSource: data.actionSource ?? existing?.action_source ?? "WEB",
    enabled: (data.enabled ?? existing?.enabled === 1) ? 1 : 0,
    sendAll: (data.sendAll ?? existing?.send_all === 1) ? 1 : 0,
    mapping: data.mapping ? JSON.stringify(data.mapping) : existing?.mapping_json ?? "",
    now: new Date().toISOString()
  };
  // Enabling without a pixel and a token would only produce failed sends.
  if (next.enabled === 1 && (!next.pixelId || !next.token)) next.enabled = 0;
  if (existing) {
    await prisma.$executeRaw`UPDATE snap_ads_settings SET pixel_id = ${next.pixelId}, access_token_enc = ${next.token}, action_source = ${next.actionSource}, enabled = ${next.enabled}, send_all = ${next.sendAll}, mapping_json = ${next.mapping}, updated_at = ${next.now} WHERE tenant_id = ${tenantId}`;
  } else {
    await prisma.$executeRaw`INSERT INTO snap_ads_settings (tenant_id, pixel_id, access_token_enc, action_source, enabled, send_all, mapping_json, updated_at) VALUES (${tenantId}, ${next.pixelId}, ${next.token}, ${next.actionSource}, ${next.enabled}, ${next.sendAll}, ${next.mapping}, ${next.now})`;
  }
  return getSnapAdsSettings(tenantId);
}

/** SHA-256 of the phone as digits only with the country code (no "+"), the form Snap matches on. */
export function hashSnapPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return createHash("sha256").update(digits).digest("hex");
}

const DEAL_CURRENCY = "SAR";

export function buildSnapPayload(input: { eventName: string; phone: string; clickId?: string; actionSource: string; dealValue?: number; eventTime?: number }) {
  const value = typeof input.dealValue === "number" && Number.isFinite(input.dealValue) && input.dealValue > 0 ? Math.round(input.dealValue * 100) / 100 : 0;
  return {
    data: [{
      event_name: input.eventName,
      action_source: input.actionSource,
      event_time: input.eventTime ?? Date.now(),
      ...(input.actionSource === "WEB" ? { event_source_url: process.env.SNAP_EVENTS_PAGE_URL || "https://linklysa.io" } : {}),
      user_data: { ph: [hashSnapPhone(input.phone)], ...(input.clickId ? { sc_click_id: input.clickId } : {}) },
      ...(value > 0 ? { custom_data: { value, currency: DEAL_CURRENCY } } : {})
    }]
  };
}

export type SnapSendResult = { sent: boolean; skipped?: "disabled" | "no-mapping" | "duplicate" | "no-phone" | "not-from-ad"; ok?: boolean; eventName?: string; message?: string };

async function logEvent(entry: { tenantId: string; conversationId: string; status: string; eventName: string; eventId: string; ok: boolean; httpStatus: number; message: string }) {
  const id = `snev-${createHash("sha1").update(`${entry.eventId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 20)}`;
  await prisma.$executeRaw`INSERT INTO snap_event_log (id, tenant_id, conversation_id, status, event_name, event_id, ok, http_status, message, created_at) VALUES (${id}, ${entry.tenantId}, ${entry.conversationId}, ${entry.status}, ${entry.eventName}, ${entry.eventId}, ${entry.ok ? 1 : 0}, ${entry.httpStatus}, ${entry.message.slice(0, 500)}, ${new Date().toISOString()})`;
}

async function post(pixelId: string, token: string, body: unknown, validateOnly = false) {
  const url = new URL(`${SNAP_API_BASE}/${encodeURIComponent(pixelId)}/events${validateOnly ? "/validate" : ""}`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => null) as { status?: string; reason?: string; error?: string; message?: string; errors?: unknown; num_events_received?: number } | null;
  const ok = response.ok && payload?.status !== "FAILED" && !payload?.error;
  const detail = payload?.reason || payload?.error || payload?.message || (payload?.errors ? JSON.stringify(payload.errors).slice(0, 300) : "") || `HTTP ${response.status}`;
  return { ok, httpStatus: response.status, message: ok ? "OK" : explain(detail, response.status) };
}

function explain(message: string, status: number): string {
  if (status === 401 || status === 403) return `${message}. تأكد من صحة رمز Conversions API وأنه يخص نفس الـ Pixel.`;
  return message;
}

/** Sends the event mapped to `status` for a conversation. Never throws; a failure is logged and returned. */
export async function sendSnapStageEvent(input: { tenantId: string; conversationId: string; status: string; phone: string; dealValue?: number }): Promise<SnapSendResult> {
  try {
    const row = await readRow(input.tenantId);
    if (!row || row.enabled !== 1 || !row.pixel_id || !row.access_token_enc) return { sent: false, skipped: "disabled" };
    const eventName = parseMapping(row.mapping_json)[input.status as SnapStage] ?? "";
    if (!eventName) return { sent: false, skipped: "no-mapping" };
    if (!input.phone.replace(/\D/g, "")) return { sent: false, skipped: "no-phone" };

    // One event per conversation per stage: moving back and forth must not double-count a lead.
    const eventId = createHash("sha1").update(`${input.tenantId}:${input.conversationId}:${input.status}`).digest("hex");
    const already = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM snap_event_log WHERE tenant_id = ${input.tenantId} AND event_id = ${eventId} AND ok = 1 LIMIT 1`;
    if (already.length) return { sent: false, skipped: "duplicate", eventName };

    const source = await getAdSource(input.tenantId, input.conversationId).catch(() => null);
    const clickId = source?.platform === "snapchat" ? source.clickId : "";
    // Only conversations that came from an ad are reported, unless the workspace chose to send them all.
    const fromAd = source?.platform === "snapchat" || source?.platform === "unknown";
    if (row.send_all !== 1 && !fromAd) return { sent: false, skipped: "not-from-ad", eventName };
    const result = await post(row.pixel_id, decryptSecret(row.access_token_enc), buildSnapPayload({ eventName, phone: input.phone, clickId, actionSource: row.action_source || "WEB", dealValue: input.dealValue }));
    await logEvent({ tenantId: input.tenantId, conversationId: input.conversationId, status: input.status, eventName, eventId, ok: result.ok, httpStatus: result.httpStatus, message: result.message });
    return { sent: true, ok: result.ok, eventName, message: result.message };
  } catch (error) {
    console.error("Snap event send failed", error);
    return { sent: false, ok: false, message: "تعذر الاتصال بـ Snapchat" };
  }
}

/** Validates a sample event with the saved settings against Snap's validation endpoint (nothing is counted). */
export async function sendSnapTestEvent(tenantId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const row = await readRow(tenantId);
    if (!row?.pixel_id || !row.access_token_enc) return { ok: false, message: "احفظ Pixel ID ورمز الوصول أولًا" };
    const body = buildSnapPayload({ eventName: "SIGN_UP", phone: "966500000000", actionSource: row.action_source || "WEB" });
    const result = await post(row.pixel_id, decryptSecret(row.access_token_enc), body, true);
    const used = `Pixel ${row.pixel_id.slice(0, 4)}…${row.pixel_id.slice(-3)}`;
    return { ok: result.ok, message: result.ok ? `اجتاز الحدث التجريبي التحقق (${used}). لم يُحتسب في حملاتك.` : `رفضت Snapchat الحدث: ${result.message} (${used})` };
  } catch {
    return { ok: false, message: "تعذر الاتصال بـ Snapchat" };
  }
}

export async function recentSnapEvents(tenantId: string, limit = 10) {
  await ensureTables();
  return prisma.$queryRaw<Array<{ conversation_id: string; status: string; event_name: string; ok: number; message: string; created_at: string }>>`SELECT conversation_id, status, event_name, ok, message, created_at FROM snap_event_log WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT ${limit}`;
}

/** Called with the same inputs as the other ad-platform notifiers; never throws. */
export async function notifySnapStageChange(input: { tenantId: string; conversationId: string; stage: string; previousStage?: string; phone: string; dealValue?: number }): Promise<SnapSendResult> {
  if (!(SNAP_STAGES as readonly string[]).includes(input.stage)) return { sent: false, skipped: "no-mapping" };
  if (input.previousStage !== undefined && input.previousStage === input.stage) return { sent: false, skipped: "duplicate" };
  return sendSnapStageEvent({ tenantId: input.tenantId, conversationId: input.conversationId, status: input.stage, phone: input.phone, dealValue: input.dealValue });
}
