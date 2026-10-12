import { createHash } from "crypto";
import { getAdSource } from "./ad-source";
import { notifyMetaStageChange } from "./meta-events";
import { notifySnapStageChange } from "./snap-events";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-storage";

/**
 * TikTok Ads <-> conversation lead status.
 *
 * A conversation carries a lead status (مهتم، مؤهل، غير مؤهل...). When the status
 * changes, the mapped event is sent to TikTok's Events API so the ad account
 * learns which conversations turned into real leads and sales.
 *
 * All state lives in three small tables created on first use (raw SQL, no Prisma
 * model), so this feature is self-contained.
 */

export const DEFAULT_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

// The lead status IS the conversation's stage on the "العملاء المحتملون" page (same field), so the
// conversation panel and that page can never disagree. Keep in sync with pipelineStages in app/dashboard/types.ts.
export const LEAD_STATUSES = ["جديد", "مهتم", "مؤهل", "عرض سعر", "تم الحجز", "فاز", "خسر"] as const;
/** Stages where a deal value makes sense (same list the leads page uses). */
export const STAGES_WITH_DEAL_VALUE: readonly string[] = ["عرض سعر", "تم الحجز", "فاز", "خسر"];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** status -> TikTok event name ("" = do not send anything for this status). Editable per workspace. */
export type EventMapping = Record<LeadStatus, string>;
export const DEFAULT_MAPPING: EventMapping = { "جديد": "", "مهتم": "", "مؤهل": "Lead", "عرض سعر": "", "تم الحجز": "", "فاز": "Purchase", "خسر": "" };

const EVENT_NAME = /^[A-Za-z][A-Za-z0-9_ ]{0,39}$/;
export const EVENT_SOURCES = ["web", "crm", "app", "offline"] as const;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tiktok_ads_settings (
      tenant_id TEXT PRIMARY KEY,
      event_set_id TEXT NOT NULL DEFAULT '',
      access_token_enc TEXT NOT NULL DEFAULT '',
      event_source TEXT NOT NULL DEFAULT 'crm',
      test_event_code TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      mapping_json TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS conversation_lead_status (
      conversation_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tiktok_event_log (
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

export type TikTokAdsSettings = {
  eventSetId: string;
  hasToken: boolean;
  eventSource: string;
  testEventCode: string;
  enabled: boolean;
  mapping: EventMapping;
  updatedAt: string;
};

type SettingsRow = { event_set_id: string; access_token_enc: string; event_source: string; test_event_code: string; enabled: number; mapping_json: string; updated_at: string };

function parseMapping(json: string): EventMapping {
  const mapping: EventMapping = { ...DEFAULT_MAPPING };
  try {
    const parsed = JSON.parse(json || "{}") as Record<string, unknown>;
    for (const status of LEAD_STATUSES) {
      const value = parsed[status];
      if (typeof value === "string" && (value === "" || EVENT_NAME.test(value))) mapping[status] = value;
    }
  } catch {
    // keep defaults
  }
  return mapping;
}

async function readSettingsRow(tenantId: string): Promise<SettingsRow | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<SettingsRow[]>`SELECT event_set_id, access_token_enc, event_source, test_event_code, enabled, mapping_json, updated_at FROM tiktok_ads_settings WHERE tenant_id = ${tenantId}`;
  return rows[0] ?? null;
}

/** Settings for the admin screen: the token is never returned, only whether one is saved. */
export async function getTikTokAdsSettings(tenantId: string): Promise<TikTokAdsSettings> {
  const row = await readSettingsRow(tenantId);
  return {
    eventSetId: row?.event_set_id ?? "",
    hasToken: Boolean(row?.access_token_enc),
    eventSource: row?.event_source || "crm",
    testEventCode: row?.test_event_code ?? "",
    enabled: row?.enabled === 1,
    mapping: parseMapping(row?.mapping_json ?? ""),
    updatedAt: row?.updated_at ?? ""
  };
}

export type SettingsInput = { eventSetId?: unknown; accessToken?: unknown; eventSource?: unknown; testEventCode?: unknown; enabled?: unknown; mapping?: unknown };

export function cleanSettingsInput(input: SettingsInput): { ok: true; data: { eventSetId?: string; accessToken?: string; eventSource?: string; testEventCode?: string; enabled?: boolean; mapping?: EventMapping } } | { ok: false; error: string } {
  const data: { eventSetId?: string; accessToken?: string; eventSource?: string; testEventCode?: string; enabled?: boolean; mapping?: EventMapping } = {};
  if (input.eventSetId !== undefined) {
    const value = typeof input.eventSetId === "string" ? input.eventSetId.trim() : "";
    if (value && !/^[A-Za-z0-9_-]{4,64}$/.test(value)) return { ok: false, error: "معرّف الـ Event Set غير صالح" };
    data.eventSetId = value;
  }
  if (typeof input.accessToken === "string" && input.accessToken.trim()) {
    const token = input.accessToken.trim();
    if (token.length < 16 || token.length > 512 || /\s/.test(token)) return { ok: false, error: "رمز الوصول (Access Token) غير صالح" };
    data.accessToken = token;
  }
  if (input.eventSource !== undefined) {
    if (typeof input.eventSource !== "string" || !(EVENT_SOURCES as readonly string[]).includes(input.eventSource)) return { ok: false, error: "نوع مصدر الأحداث غير صالح" };
    data.eventSource = input.eventSource;
  }
  if (input.testEventCode !== undefined) {
    const code = typeof input.testEventCode === "string" ? input.testEventCode.trim() : "";
    if (code && !/^[A-Za-z0-9_-]{3,40}$/.test(code)) return { ok: false, error: "رمز أحداث الاختبار غير صالح" };
    data.testEventCode = code;
  }
  if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
  if (input.mapping !== undefined) {
    if (typeof input.mapping !== "object" || input.mapping === null) return { ok: false, error: "ربط الحالات غير صالح" };
    const mapping = { ...DEFAULT_MAPPING };
    for (const status of LEAD_STATUSES) {
      const value = (input.mapping as Record<string, unknown>)[status];
      if (value === undefined) continue;
      if (typeof value !== "string" || (value !== "" && !EVENT_NAME.test(value.trim()))) return { ok: false, error: `اسم الحدث للحالة «${status}» غير صالح (حروف إنجليزية وأرقام فقط)` };
      mapping[status] = value.trim();
    }
    data.mapping = mapping;
  }
  return { ok: true, data };
}

export async function saveTikTokAdsSettings(tenantId: string, data: { eventSetId?: string; accessToken?: string; eventSource?: string; testEventCode?: string; enabled?: boolean; mapping?: EventMapping }): Promise<TikTokAdsSettings> {
  await ensureTables();
  const existing = await readSettingsRow(tenantId);
  const next = {
    eventSetId: data.eventSetId ?? existing?.event_set_id ?? "",
    token: data.accessToken ? encryptSecret(data.accessToken) : existing?.access_token_enc ?? "",
    eventSource: data.eventSource ?? existing?.event_source ?? "crm",
    testEventCode: data.testEventCode ?? existing?.test_event_code ?? "",
    enabled: (data.enabled ?? existing?.enabled === 1) ? 1 : 0,
    mapping: data.mapping ? JSON.stringify(data.mapping) : existing?.mapping_json ?? "",
    now: new Date().toISOString()
  };
  // Enabling without a saved token/event set would only produce failed sends.
  if (next.enabled === 1 && (!next.eventSetId || !next.token)) next.enabled = 0;
  if (existing) {
    await prisma.$executeRaw`UPDATE tiktok_ads_settings SET event_set_id = ${next.eventSetId}, access_token_enc = ${next.token}, event_source = ${next.eventSource}, test_event_code = ${next.testEventCode}, enabled = ${next.enabled}, mapping_json = ${next.mapping}, updated_at = ${next.now} WHERE tenant_id = ${tenantId}`;
  } else {
    await prisma.$executeRaw`INSERT INTO tiktok_ads_settings (tenant_id, event_set_id, access_token_enc, event_source, test_event_code, enabled, mapping_json, updated_at) VALUES (${tenantId}, ${next.eventSetId}, ${next.token}, ${next.eventSource}, ${next.testEventCode}, ${next.enabled}, ${next.mapping}, ${next.now})`;
  }
  return getTikTokAdsSettings(tenantId);
}

/** SHA-256 of the phone in E.164 form, as TikTok's matching expects. */
export function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return createHash("sha256").update(`+${digits}`).digest("hex");
}

export type SendResult = { sent: boolean; skipped?: "disabled" | "no-mapping" | "duplicate" | "no-phone"; ok?: boolean; eventName?: string; message?: string };

async function logEvent(entry: { tenantId: string; conversationId: string; status: string; eventName: string; eventId: string; ok: boolean; httpStatus: number; message: string }) {
  const id = `ttev-${createHash("sha1").update(`${entry.eventId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 20)}`;
  await prisma.$executeRaw`INSERT INTO tiktok_event_log (id, tenant_id, conversation_id, status, event_name, event_id, ok, http_status, message, created_at) VALUES (${id}, ${entry.tenantId}, ${entry.conversationId}, ${entry.status}, ${entry.eventName}, ${entry.eventId}, ${entry.ok ? 1 : 0}, ${entry.httpStatus}, ${entry.message.slice(0, 300)}, ${new Date().toISOString()})`;
}

async function post(url: string, token: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": token }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => null) as { code?: number; message?: string } | null;
  // TikTok answers 200 with {code: 0} on success; a non-zero code is a rejection.
  const ok = response.ok && (payload?.code === undefined || payload.code === 0);
  return { ok, httpStatus: response.status, message: ok ? "OK" : explainRejection(payload?.message || `HTTP ${response.status}`) };
}

/** TikTok rejects an ID of one kind sent as another (a Pixel code needs source "web"; a CRM event set needs "crm"). */
function explainRejection(message: string): string {
  if (/event_source_id/i.test(message)) return `${message}. تأكد أن «نوع المصدر» يطابق نوع المعرّف: معرّف Pixel (20 حرفًا) ← Pixel (web)، ومعرّف مجموعة أحداث CRM ← CRM.`;
  return message;
}

function buildPayload(settings: { eventSetId: string; eventSource: string; testEventCode: string }, event: { name: string; eventId: string; phone: string; clickId?: string; properties?: Record<string, unknown> }) {
  return {
    event_source: settings.eventSource,
    event_source_id: settings.eventSetId,
    ...(settings.testEventCode ? { test_event_code: settings.testEventCode } : {}),
    data: [{
      event: event.name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      user: { phone: hashPhone(event.phone), ...(event.clickId ? { ttclid: event.clickId } : {}) },
      properties: event.properties ?? {},
      // Web (Pixel) events carry the page they came from; for a conversation that is the platform's own site.
      ...(settings.eventSource === "web" ? { page: { url: process.env.TIKTOK_EVENTS_PAGE_URL || "https://linklysa.io" } } : {})
    }]
  };
}

/** The sale value TikTok learns from; only sent when the conversation has one. */
export const DEAL_CURRENCY = "SAR";
function dealProperties(dealValue?: number): Record<string, unknown> {
  return typeof dealValue === "number" && Number.isFinite(dealValue) && dealValue > 0 ? { value: Math.round(dealValue * 100) / 100, currency: DEAL_CURRENCY } : {};
}

/** Sends the event mapped to `status` for this conversation. Never throws; a failure is logged and returned. */
export async function sendLeadStatusEvent(input: { tenantId: string; conversationId: string; status: string; phone: string; dealValue?: number; clickId?: string }): Promise<SendResult> {
  try {
    const row = await readSettingsRow(input.tenantId);
    if (!row || row.enabled !== 1 || !row.event_set_id || !row.access_token_enc) return { sent: false, skipped: "disabled" };
    const eventName = parseMapping(row.mapping_json)[input.status as LeadStatus] ?? "";
    if (!eventName) return { sent: false, skipped: "no-mapping" };
    if (!input.phone.replace(/\D/g, "")) return { sent: false, skipped: "no-phone" };

    // One event per conversation per status: moving back and forth must not double-count a lead.
    const eventId = createHash("sha1").update(`${input.tenantId}:${input.conversationId}:${input.status}`).digest("hex");
    const already = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM tiktok_event_log WHERE tenant_id = ${input.tenantId} AND event_id = ${eventId} AND ok = 1 LIMIT 1`;
    if (already.length) return { sent: false, skipped: "duplicate", eventName };

    const url = process.env.TIKTOK_EVENTS_URL || DEFAULT_EVENTS_URL;
    const result = await post(url, decryptSecret(row.access_token_enc), buildPayload({ eventSetId: row.event_set_id, eventSource: row.event_source || "crm", testEventCode: row.test_event_code }, { name: eventName, eventId, phone: input.phone, clickId: input.clickId, properties: { lead_status: input.status, ...dealProperties(input.dealValue) } }));
    await logEvent({ tenantId: input.tenantId, conversationId: input.conversationId, status: input.status, eventName, eventId, ok: result.ok, httpStatus: result.httpStatus, message: result.message });
    return { sent: true, ok: result.ok, eventName, message: result.message };
  } catch (error) {
    console.error("TikTok event send failed", error);
    return { sent: false, ok: false, message: "تعذر الاتصال بـ TikTok" };
  }
}

/** A harmless test event with the saved settings (uses the test event code when one is set). */
export async function sendTestEvent(tenantId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const row = await readSettingsRow(tenantId);
    if (!row || !row.event_set_id || !row.access_token_enc) return { ok: false, message: "احفظ Event Set ID ورمز الوصول أولًا" };
    const url = process.env.TIKTOK_EVENTS_URL || DEFAULT_EVENTS_URL;
    const eventId = `test-${Date.now()}`;
    const result = await post(url, decryptSecret(row.access_token_enc), buildPayload({ eventSetId: row.event_set_id, eventSource: row.event_source || "crm", testEventCode: row.test_event_code }, { name: "Lead", eventId, phone: "966500000000", properties: { lead_status: "test" } }));
    const used = `نوع المصدر المستخدم: ${row.event_source || "crm"}، المعرّف: ${row.event_set_id.slice(0, 4)}…${row.event_set_id.slice(-3)}`;
    return { ok: result.ok, message: result.ok ? `أُرسل حدث اختباري بنجاح (${used})` : `رفضت TikTok الحدث: ${result.message} (${used})` };
  } catch {
    return { ok: false, message: "تعذر الاتصال بـ TikTok" };
  }
}

export async function getDealValue(tenantId: string, conversationId: string): Promise<number> {
  const row = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { dealValue: true } });
  return row?.dealValue ?? 0;
}

export async function getLeadStatus(tenantId: string, conversationId: string): Promise<LeadStatus> {
  const row = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { pipelineStage: true } });
  const stage = row?.pipelineStage ?? "";
  return (LEAD_STATUSES as readonly string[]).includes(stage) ? (stage as LeadStatus) : "جديد";
}

/** The TikTok click id of the ad that opened this conversation, if it was captured. */
async function tiktokClickId(tenantId: string, conversationId: string): Promise<string> {
  try {
    const source = await getAdSource(tenantId, conversationId);
    return source?.platform === "tiktok" ? source.clickId : "";
  } catch {
    return "";
  }
}

/**
 * Sends the TikTok event for a stage change. Called by every path that changes the
 * stage (the conversation panel and the leads page) so both behave the same.
 * Never throws; the stage is already saved when this runs.
 */
export async function notifyStageChange(input: { tenantId: string; conversationId: string; stage: string; previousStage?: string; phone: string; dealValue?: number }): Promise<SendResult> {
  if (!(LEAD_STATUSES as readonly string[]).includes(input.stage)) return { sent: false, skipped: "no-mapping" };
  if (input.previousStage !== undefined && input.previousStage === input.stage) return { sent: false, skipped: "duplicate" };
  // Every ad platform the workspace connected hears about the change; one failing never blocks the other.
  const [result] = await Promise.all([
    (async () => sendLeadStatusEvent({ tenantId: input.tenantId, conversationId: input.conversationId, status: input.stage, phone: input.phone, dealValue: input.dealValue, clickId: await tiktokClickId(input.tenantId, input.conversationId) }))(),
    notifyMetaStageChange({ tenantId: input.tenantId, conversationId: input.conversationId, stage: input.stage, dealValue: input.dealValue }),
    notifySnapStageChange({ tenantId: input.tenantId, conversationId: input.conversationId, stage: input.stage, phone: input.phone, dealValue: input.dealValue })
  ]);
  return result;
}

/** Saves the stage (and optional deal value) of a conversation of `tenantId`, then sends the mapped event. */
export async function setLeadStatus(input: { tenantId: string; conversationId: string; status: unknown; actor: string; dealValue?: unknown }): Promise<{ ok: true; status: LeadStatus; event: SendResult } | { ok: false; error: string; code: number }> {
  if (typeof input.status !== "string" || !(LEAD_STATUSES as readonly string[]).includes(input.status)) return { ok: false, error: "حالة غير صالحة", code: 400 };
  const status = input.status as LeadStatus;
  const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, tenantId: input.tenantId }, select: { id: true, dealValue: true, pipelineStage: true, customer: { select: { phone: true } } } });
  if (!conversation) return { ok: false, error: "المحادثة غير موجودة", code: 404 };

  let dealValue = conversation.dealValue;
  if (input.dealValue !== undefined && input.dealValue !== null && input.dealValue !== "") {
    const parsed = Number(input.dealValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) return { ok: false, error: "قيمة الصفقة غير صالحة", code: 400 };
    dealValue = Math.round(parsed * 100) / 100;
  }

  await prisma.conversation.updateMany({ where: { id: input.conversationId, tenantId: input.tenantId }, data: { pipelineStage: status, dealValue } });
  const event = await notifyStageChange({ tenantId: input.tenantId, conversationId: input.conversationId, stage: status, previousStage: conversation.pipelineStage, phone: conversation.customer.phone, dealValue });
  return { ok: true, status, event };
}

export async function recentEvents(tenantId: string, limit = 10) {
  await ensureTables();
  return prisma.$queryRaw<Array<{ conversation_id: string; status: string; event_name: string; ok: number; message: string; created_at: string }>>`SELECT conversation_id, status, event_name, ok, message, created_at FROM tiktok_event_log WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT ${limit}`;
}
