import { createHash } from "crypto";
import { pipelineStages } from "../app/dashboard/types";
import { getAdSource } from "./ad-source";
import { hashEmail, hashName, hashPhoneDigits } from "./identity-hash";
import { getLeadContact, type LeadContact } from "./lead-contact";
import { getIntegrationSettings } from "./database";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-storage";

/**
 * Meta Ads <-> conversation stage.
 *
 * When a conversation that began from a click-to-WhatsApp ad changes stage, the mapped
 * event is sent to the workspace's Meta dataset (pixel) through the Conversions API for
 * business messaging, so Meta learns which conversations became real leads and sales.
 *
 * The workspace either signs in with Meta and picks its ad account and dataset from lists
 * (token_kind "oauth", a 60-day token), or pastes a dataset ID and a system-user token
 * (token_kind "manual", does not expire). State lives in two small tables created on first
 * use (raw SQL, no Prisma model), like the TikTok feature.
 */

export const GRAPH_VERSION = "v22.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const META_STAGES = pipelineStages;
export type MetaStage = (typeof META_STAGES)[number];
/** stage -> Meta event name ("" = send nothing). Editable per workspace. */
export type MetaMapping = Record<MetaStage, string>;
export const DEFAULT_META_MAPPING: MetaMapping = { "جديد": "", "مهتم": "", "مؤهل": "Lead", "عرض سعر": "", "تم الحجز": "", "فاز": "Purchase", "خسر": "" };

const EVENT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const NUMERIC_ID = /^\d{5,24}$/;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS meta_ads_settings (
      tenant_id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL DEFAULT '',
      dataset_name TEXT NOT NULL DEFAULT '',
      ad_account_id TEXT NOT NULL DEFAULT '',
      ad_account_name TEXT NOT NULL DEFAULT '',
      access_token_enc TEXT NOT NULL DEFAULT '',
      token_kind TEXT NOT NULL DEFAULT 'manual',
      token_expires_at TEXT NOT NULL DEFAULT '',
      test_event_code TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      mapping_json TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS meta_event_log (
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

type Row = {
  dataset_id: string; dataset_name: string; ad_account_id: string; ad_account_name: string;
  access_token_enc: string; token_kind: string; token_expires_at: string; test_event_code: string;
  enabled: number; mapping_json: string; updated_at: string;
};

export type MetaAdsSettings = {
  datasetId: string;
  datasetName: string;
  adAccountId: string;
  adAccountName: string;
  hasToken: boolean;
  tokenKind: "oauth" | "manual";
  tokenExpiresAt: string;
  tokenExpired: boolean;
  testEventCode: string;
  enabled: boolean;
  mapping: MetaMapping;
  updatedAt: string;
};

function parseMapping(json: string): MetaMapping {
  const mapping: MetaMapping = { ...DEFAULT_META_MAPPING };
  try {
    const parsed = JSON.parse(json || "{}") as Record<string, unknown>;
    for (const stage of META_STAGES) {
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
  const rows = await prisma.$queryRaw<Row[]>`SELECT dataset_id, dataset_name, ad_account_id, ad_account_name, access_token_enc, token_kind, token_expires_at, test_event_code, enabled, mapping_json, updated_at FROM meta_ads_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  return rows[0] ?? null;
}

/** Settings for the screen: the token is never returned, only whether one is saved and whether it has expired. */
export async function getMetaAdsSettings(tenantId: string): Promise<MetaAdsSettings> {
  const row = await readRow(tenantId);
  const expiresAt = row?.token_expires_at ?? "";
  return {
    datasetId: row?.dataset_id ?? "",
    datasetName: row?.dataset_name ?? "",
    adAccountId: row?.ad_account_id ?? "",
    adAccountName: row?.ad_account_name ?? "",
    hasToken: Boolean(row?.access_token_enc),
    tokenKind: row?.token_kind === "oauth" ? "oauth" : "manual",
    tokenExpiresAt: expiresAt,
    tokenExpired: Boolean(expiresAt) && Date.parse(expiresAt) < Date.now(),
    testEventCode: row?.test_event_code ?? "",
    enabled: row?.enabled === 1,
    mapping: parseMapping(row?.mapping_json ?? ""),
    updatedAt: row?.updated_at ?? ""
  };
}

export type MetaSettingsInput = {
  datasetId?: unknown; datasetName?: unknown; adAccountId?: unknown; adAccountName?: unknown;
  accessToken?: unknown; testEventCode?: unknown; enabled?: unknown; mapping?: unknown;
};
type CleanData = {
  datasetId?: string; datasetName?: string; adAccountId?: string; adAccountName?: string;
  accessToken?: string; testEventCode?: string; enabled?: boolean; mapping?: MetaMapping;
};

function cleanText(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "";
}

export function cleanMetaSettingsInput(input: MetaSettingsInput): { ok: true; data: CleanData } | { ok: false; error: string } {
  const data: CleanData = {};
  if (input.datasetId !== undefined) {
    const value = cleanText(input.datasetId, 40);
    if (value && !NUMERIC_ID.test(value)) return { ok: false, error: "معرّف الـ Dataset (البيكسل) يجب أن يكون أرقامًا فقط" };
    data.datasetId = value;
  }
  if (input.datasetName !== undefined) data.datasetName = cleanText(input.datasetName);
  if (input.adAccountId !== undefined) {
    const value = cleanText(input.adAccountId, 40).replace(/^act_/i, "");
    if (value && !NUMERIC_ID.test(value)) return { ok: false, error: "معرّف الحساب الإعلاني غير صالح" };
    data.adAccountId = value;
  }
  if (input.adAccountName !== undefined) data.adAccountName = cleanText(input.adAccountName);
  if (typeof input.accessToken === "string" && input.accessToken.trim()) {
    const token = input.accessToken.trim();
    if (token.length < 20 || token.length > 1000 || /\s/.test(token)) return { ok: false, error: "رمز الوصول (Access Token) غير صالح" };
    data.accessToken = token;
  }
  if (input.testEventCode !== undefined) {
    const code = cleanText(input.testEventCode, 40);
    if (code && !/^[A-Za-z0-9_-]{3,40}$/.test(code)) return { ok: false, error: "رمز أحداث الاختبار غير صالح" };
    data.testEventCode = code;
  }
  if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
  if (input.mapping !== undefined) {
    if (typeof input.mapping !== "object" || input.mapping === null) return { ok: false, error: "ربط الحالات غير صالح" };
    const mapping = { ...DEFAULT_META_MAPPING };
    for (const stage of META_STAGES) {
      const value = (input.mapping as Record<string, unknown>)[stage];
      if (value === undefined) continue;
      if (typeof value !== "string" || (value.trim() !== "" && !EVENT_NAME.test(value.trim()))) return { ok: false, error: `اسم الحدث للحالة «${stage}» غير صالح (حروف إنجليزية وأرقام فقط)` };
      mapping[stage] = value.trim();
    }
    data.mapping = mapping;
  }
  return { ok: true, data };
}

export async function saveMetaAdsSettings(tenantId: string, data: CleanData & { tokenKind?: "oauth" | "manual"; tokenExpiresAt?: string }): Promise<MetaAdsSettings> {
  await ensureTables();
  const existing = await readRow(tenantId);
  // A token pasted by hand replaces an OAuth one and never expires.
  const kind = data.tokenKind ?? (data.accessToken ? "manual" : existing?.token_kind ?? "manual");
  const next = {
    datasetId: data.datasetId ?? existing?.dataset_id ?? "",
    datasetName: data.datasetName ?? existing?.dataset_name ?? "",
    adAccountId: data.adAccountId ?? existing?.ad_account_id ?? "",
    adAccountName: data.adAccountName ?? existing?.ad_account_name ?? "",
    token: data.accessToken ? encryptSecret(data.accessToken) : existing?.access_token_enc ?? "",
    kind,
    expiresAt: data.tokenExpiresAt ?? (data.accessToken ? "" : existing?.token_expires_at ?? ""),
    testEventCode: data.testEventCode ?? existing?.test_event_code ?? "",
    enabled: (data.enabled ?? existing?.enabled === 1) ? 1 : 0,
    mapping: data.mapping ? JSON.stringify(data.mapping) : existing?.mapping_json ?? "",
    now: new Date().toISOString()
  };
  // Enabling without a dataset and a token would only produce failed sends.
  if (next.enabled === 1 && (!next.datasetId || !next.token)) next.enabled = 0;
  if (existing) {
    await prisma.$executeRaw`UPDATE meta_ads_settings SET dataset_id = ${next.datasetId}, dataset_name = ${next.datasetName}, ad_account_id = ${next.adAccountId}, ad_account_name = ${next.adAccountName}, access_token_enc = ${next.token}, token_kind = ${next.kind}, token_expires_at = ${next.expiresAt}, test_event_code = ${next.testEventCode}, enabled = ${next.enabled}, mapping_json = ${next.mapping}, updated_at = ${next.now} WHERE tenant_id = ${tenantId}`;
  } else {
    await prisma.$executeRaw`INSERT INTO meta_ads_settings (tenant_id, dataset_id, dataset_name, ad_account_id, ad_account_name, access_token_enc, token_kind, token_expires_at, test_event_code, enabled, mapping_json, updated_at) VALUES (${tenantId}, ${next.datasetId}, ${next.datasetName}, ${next.adAccountId}, ${next.adAccountName}, ${next.token}, ${next.kind}, ${next.expiresAt}, ${next.testEventCode}, ${next.enabled}, ${next.mapping}, ${next.now})`;
  }
  return getMetaAdsSettings(tenantId);
}

/** Clears the saved connection (token and chosen dataset) and turns sending off. */
export async function disconnectMetaAds(tenantId: string): Promise<void> {
  await ensureTables();
  await prisma.$executeRaw`UPDATE meta_ads_settings SET access_token_enc = '', token_kind = 'manual', token_expires_at = '', dataset_id = '', dataset_name = '', ad_account_id = '', ad_account_name = '', enabled = 0, updated_at = ${new Date().toISOString()} WHERE tenant_id = ${tenantId}`;
}

// ---- Sign in with Meta: token exchange and the ad account / dataset lists ----

type GraphError = { error?: { message?: string; code?: number } };

/** Exchanges the OAuth `code` for a long-lived (about 60 days) user token. */
export async function exchangeCodeForLongLivedToken(code: string, redirectUri: string): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const appId = process.env.META_ADS_APP_ID || "1296230909161568";
  const appSecret = process.env.META_ADS_APP_SECRET || process.env.WHATSAPP_META_APP_SECRET || "";
  if (!appSecret) return { error: "إعداد تطبيق ميتا غير مكتمل على الخادم" };

  const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", appId);
  shortUrl.searchParams.set("client_secret", appSecret);
  shortUrl.searchParams.set("redirect_uri", redirectUri);
  shortUrl.searchParams.set("code", code);
  const shortResponse = await fetch(shortUrl, { signal: AbortSignal.timeout(10000) });
  const shortPayload = await shortResponse.json().catch(() => null) as ({ access_token?: string } & GraphError) | null;
  if (!shortResponse.ok || !shortPayload?.access_token) return { error: shortPayload?.error?.message || "تعذر إكمال تسجيل الدخول مع ميتا" };

  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortPayload.access_token);
  const longResponse = await fetch(longUrl, { signal: AbortSignal.timeout(10000) });
  const longPayload = await longResponse.json().catch(() => null) as ({ access_token?: string; expires_in?: number } & GraphError) | null;
  if (!longResponse.ok || !longPayload?.access_token) return { token: shortPayload.access_token, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() };
  const seconds = typeof longPayload.expires_in === "number" && longPayload.expires_in > 0 ? longPayload.expires_in : 60 * 24 * 60 * 60;
  return { token: longPayload.access_token, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

export type MetaAdAsset = { id: string; name: string; datasets: Array<{ id: string; name: string }> };

/** The ad accounts the signed-in person can use, each with its datasets (pixels). */
export async function listAdAssets(tenantId: string): Promise<{ ok: true; accounts: MetaAdAsset[] } | { ok: false; error: string }> {
  const row = await readRow(tenantId);
  if (!row?.access_token_enc) return { ok: false, error: "سجّل الدخول مع ميتا أولًا" };
  try {
    const url = new URL(`${GRAPH}/me/adaccounts`);
    url.searchParams.set("fields", "account_id,name,adspixels.limit(25){id,name}");
    url.searchParams.set("limit", "50");
    url.searchParams.set("access_token", decryptSecret(row.access_token_enc));
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const payload = await response.json().catch(() => null) as ({ data?: Array<{ account_id?: string; name?: string; adspixels?: { data?: Array<{ id?: string; name?: string }> } }> } & GraphError) | null;
    if (!response.ok || !payload?.data) {
      const expired = payload?.error?.code === 190;
      return { ok: false, error: expired ? "انتهت صلاحية الدخول مع ميتا. أعد تسجيل الدخول." : payload?.error?.message || "تعذر جلب الحسابات الإعلانية" };
    }
    const accounts = payload.data
      .filter((account) => account.account_id)
      .map((account) => ({
        id: String(account.account_id),
        name: account.name || `act_${account.account_id}`,
        datasets: (account.adspixels?.data ?? []).filter((pixel) => pixel.id).map((pixel) => ({ id: String(pixel.id), name: pixel.name || String(pixel.id) }))
      }));
    return { ok: true, accounts };
  } catch {
    return { ok: false, error: "تعذر الاتصال بميتا" };
  }
}

// ---- Sending events ----

export type MetaSendResult = { sent: boolean; skipped?: "disabled" | "no-mapping" | "duplicate" | "no-click-id" | "no-waba"; ok?: boolean; eventName?: string; message?: string };

async function logEvent(entry: { tenantId: string; conversationId: string; status: string; eventName: string; eventId: string; ok: boolean; httpStatus: number; message: string }) {
  const id = `mtev-${createHash("sha1").update(`${entry.eventId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 20)}`;
  await prisma.$executeRaw`INSERT INTO meta_event_log (id, tenant_id, conversation_id, status, event_name, event_id, ok, http_status, message, created_at) VALUES (${id}, ${entry.tenantId}, ${entry.conversationId}, ${entry.status}, ${entry.eventName}, ${entry.eventId}, ${entry.ok ? 1 : 0}, ${entry.httpStatus}, ${entry.message.slice(0, 500)}, ${new Date().toISOString()})`;
}

function explain(message: string, code?: number): string {
  if (code === 190) return "انتهت صلاحية رمز الوصول. أعد تسجيل الدخول مع ميتا أو ضع رمزًا جديدًا.";
  if (/permission|\(#200\)|\(#10\)/i.test(message)) return `${message}. تأكد أن الرمز يملك صلاحية ads_management على هذا الـ Dataset.`;
  return message;
}

async function post(datasetId: string, token: string, body: Record<string, unknown>) {
  const url = new URL(`${GRAPH}/${datasetId}/events`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => null) as ({ events_received?: number } & GraphError) | null;
  const ok = response.ok && (payload?.events_received ?? 0) > 0;
  const message = ok ? "OK" : explain(payload?.error?.message || `HTTP ${response.status}`, payload?.error?.code);
  return { ok, httpStatus: response.status, message };
}

const DEAL_CURRENCY = "SAR";

export function buildMetaPayload(input: { eventName: string; eventId: string; wabaId: string; clickId: string; dealValue?: number; testEventCode?: string; eventTime?: number; phone?: string; contact?: LeadContact }) {
  const value = typeof input.dealValue === "number" && Number.isFinite(input.dealValue) && input.dealValue > 0 ? Math.round(input.dealValue * 100) / 100 : 0;
  return {
    data: [{
      event_name: input.eventName,
      event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        whatsapp_business_account_id: input.wabaId,
        ctwa_clid: input.clickId,
        // Extra hashed identifiers (Meta hashes-only): they raise the Event Match Quality.
        ...(hashPhoneDigits(input.phone) ? { ph: [hashPhoneDigits(input.phone)] } : {}),
        ...(hashEmail(input.contact?.email) ? { em: [hashEmail(input.contact?.email)] } : {}),
        ...(hashName(input.contact?.firstName) ? { fn: [hashName(input.contact?.firstName)] } : {}),
        ...(hashName(input.contact?.lastName) ? { ln: [hashName(input.contact?.lastName)] } : {})
      },
      ...(value > 0 ? { custom_data: { value, currency: DEAL_CURRENCY } } : {})
    }],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {})
  };
}

/** Sends the event mapped to `status` for a conversation. Never throws; a failure is logged and returned. */
export async function sendMetaStageEvent(input: { tenantId: string; conversationId: string; status: string; dealValue?: number }): Promise<MetaSendResult> {
  try {
    const row = await readRow(input.tenantId);
    if (!row || row.enabled !== 1 || !row.dataset_id || !row.access_token_enc) return { sent: false, skipped: "disabled" };
    const eventName = parseMapping(row.mapping_json)[input.status as MetaStage] ?? "";
    if (!eventName) return { sent: false, skipped: "no-mapping" };

    // Business-messaging events are matched through the ad click id; a conversation that did not come from an ad has none.
    const source = await getAdSource(input.tenantId, input.conversationId);
    const clickId = source?.platform === "meta" ? source.clickId : "";
    if (!clickId) return { sent: false, skipped: "no-click-id", eventName };

    const waba = (await getIntegrationSettings("whatsapp", input.tenantId)).wabaId?.trim() || "";
    if (!waba) return { sent: false, skipped: "no-waba", eventName };

    // One event per conversation per stage: moving back and forth must not double-count a lead.
    const eventId = createHash("sha1").update(`${input.tenantId}:${input.conversationId}:${input.status}`).digest("hex");
    const already = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM meta_event_log WHERE tenant_id = ${input.tenantId} AND event_id = ${eventId} AND ok = 1 LIMIT 1`;
    if (already.length) return { sent: false, skipped: "duplicate", eventName };

    const [contact, conversation] = await Promise.all([
      getLeadContact(input.tenantId, input.conversationId),
      prisma.conversation.findFirst({ where: { id: input.conversationId, tenantId: input.tenantId }, select: { customer: { select: { phone: true } } } })
    ]);
    const result = await post(row.dataset_id, decryptSecret(row.access_token_enc), buildMetaPayload({ eventName, eventId, wabaId: waba, clickId, dealValue: input.dealValue, testEventCode: row.test_event_code, phone: conversation?.customer.phone, contact }));
    await logEvent({ tenantId: input.tenantId, conversationId: input.conversationId, status: input.status, eventName, eventId, ok: result.ok, httpStatus: result.httpStatus, message: result.message });
    return { sent: true, ok: result.ok, eventName, message: result.message };
  } catch (error) {
    console.error("Meta event send failed", error);
    return { sent: false, ok: false, message: "تعذر الاتصال بميتا" };
  }
}

/** A harmless test event to the saved dataset; it carries the test event code, so it only shows under Test events. */
export async function sendMetaTestEvent(tenantId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const row = await readRow(tenantId);
    if (!row?.dataset_id || !row.access_token_enc) return { ok: false, message: "احفظ Dataset ID ورمز الوصول أولًا" };
    if (!row.test_event_code) return { ok: false, message: "ضع «رمز أحداث الاختبار» من تبويب Test events في ميتا أولًا، حتى لا يُحتسب الحدث التجريبي في حملاتك." };
    const waba = (await getIntegrationSettings("whatsapp", tenantId)).wabaId?.trim() || "000000000000000";
    const eventId = `test-${Date.now()}`;
    const result = await post(row.dataset_id, decryptSecret(row.access_token_enc), buildMetaPayload({ eventName: "Lead", eventId, wabaId: waba, clickId: `test.${Date.now()}`, testEventCode: row.test_event_code }));
    const used = `Dataset ${row.dataset_id.slice(0, 4)}…${row.dataset_id.slice(-3)}`;
    return { ok: result.ok, message: result.ok ? `أُرسل حدث اختباري بنجاح (${used}). تحقق منه في Test events.` : `رفضت ميتا الحدث: ${result.message} (${used})` };
  } catch {
    return { ok: false, message: "تعذر الاتصال بميتا" };
  }
}

export async function recentMetaEvents(tenantId: string, limit = 10) {
  await ensureTables();
  return prisma.$queryRaw<Array<{ conversation_id: string; status: string; event_name: string; ok: number; message: string; created_at: string }>>`SELECT conversation_id, status, event_name, ok, message, created_at FROM meta_event_log WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT ${limit}`;
}

/** Called with the same inputs as the TikTok notifier; never throws. */
export async function notifyMetaStageChange(input: { tenantId: string; conversationId: string; stage: string; previousStage?: string; dealValue?: number }): Promise<MetaSendResult> {
  if (!(META_STAGES as readonly string[]).includes(input.stage)) return { sent: false, skipped: "no-mapping" };
  if (input.previousStage !== undefined && input.previousStage === input.stage) return { sent: false, skipped: "duplicate" };
  return sendMetaStageEvent({ tenantId: input.tenantId, conversationId: input.conversationId, status: input.stage, dealValue: input.dealValue });
}
