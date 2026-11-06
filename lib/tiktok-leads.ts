import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema, getIntegrationSettings } from "./database";
import { decryptSecret, encryptSecret } from "./secret-storage";
import { formatMessageTime } from "./time";
import { firstChar } from "./first-char";
import { summarizeFormAnswers } from "./lead-form";
import { recordFormAdSource } from "./ad-source";
import { runInboundMessageAutomations } from "./automation-engine";
import { triggerWebhookEvent } from "./webhooks";
import { sendWhatsAppTemplate } from "./campaign-engine";
import { storeWhatsAppMessage, whatsappThreadIds } from "./whatsapp-inbox";
import { leadWhatsappNumber } from "./phone-format";
import { whatsappNumberFromForm } from "./snapchat-inbox";

/**
 * TikTok lead forms (Instant Forms) straight from TikTok API for Business: the advertiser authorizes Linkly's
 * app, Linkly subscribes to the LEAD webhook for each authorized ad account, and every new lead arrives in the
 * webhook with its answers. Separate from the organic "tiktok" channel (Login Kit).
 */
const API = "https://business-api.tiktok.com/open_api/v1.3";

export const tiktokAdsAppId = () => process.env.TIKTOK_ADS_APP_ID?.trim() || "";
const tiktokAdsSecret = () => process.env.TIKTOK_ADS_APP_SECRET?.trim() || "";
export const tiktokAdsConfigured = () => Boolean(tiktokAdsAppId() && tiktokAdsSecret());

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tiktok_lead_connections (
      tenant_id TEXT PRIMARY KEY,
      webhook_token TEXT NOT NULL,
      access_token TEXT NOT NULL,
      advertiser_ids TEXT NOT NULL DEFAULT '',
      subscription_ids TEXT NOT NULL DEFAULT '',
      connected_by TEXT NOT NULL DEFAULT '',
      connected_at TEXT NOT NULL
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function post<T>(path: string, body: Record<string, unknown>, accessToken?: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { "Access-Token": accessToken } : {}) },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
    if (!response.ok || !payload || payload.code !== 0) return { ok: false, error: `${payload?.code ?? response.status}: ${payload?.message || "request failed"}` };
    return { ok: true, data: (payload.data ?? {}) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "request failed" };
  }
}

/** Trades the authorization code TikTok sent back for the advertiser's access token and the ad accounts they authorized. */
export async function exchangeTikTokAuthCode(authCode: string) {
  const result = await post<{ access_token?: string; advertiser_ids?: Array<string | number> }>("/oauth2/access_token/", { app_id: tiktokAdsAppId(), secret: tiktokAdsSecret(), auth_code: authCode });
  if (!result.ok) return result;
  const accessToken = result.data.access_token || "";
  if (!accessToken) return { ok: false as const, error: "no access token" };
  return { ok: true as const, data: { accessToken, advertiserIds: (result.data.advertiser_ids ?? []).map(String) } };
}

export function leadWebhookUrl(origin: string, token: string) {
  // The token sits in the path: TikTok rejects callback URLs that carry query parameters.
  return `${origin}/api/tiktok-ads/webhook/${encodeURIComponent(token)}`;
}

async function subscribeLeads(accessToken: string, advertiserId: string, callbackUrl: string) {
  const result = await post<{ subscription_id?: string }>("/subscription/subscribe/", {
    app_id: tiktokAdsAppId(),
    secret: tiktokAdsSecret(),
    subscribe_entity: "LEAD",
    callback_url: callbackUrl,
    subscription_detail: { access_token: accessToken, advertiser_id: advertiserId }
  }, accessToken);
  return result.ok ? { ok: true as const, id: String(result.data.subscription_id || "") } : result;
}

export type TikTokAdvertiser = { id: string; name: string };

/** The ad accounts the advertiser authorized, with their names (falls back to the ids from the token exchange). */
async function listAdvertisers(accessToken: string, fallbackIds: string[]): Promise<TikTokAdvertiser[]> {
  try {
    const url = new URL(`${API}/oauth2/advertiser/get/`);
    url.searchParams.set("app_id", tiktokAdsAppId());
    url.searchParams.set("secret", tiktokAdsSecret());
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    const payload = await response.json().catch(() => null) as { code?: number; data?: { list?: Array<{ advertiser_id?: string | number; advertiser_name?: string }> } } | null;
    const list = payload?.code === 0 ? payload.data?.list ?? [] : [];
    const named = new Map(list.map((item) => [String(item.advertiser_id ?? ""), (item.advertiser_name || "").trim()]));
    const ids = fallbackIds.length ? fallbackIds : [...named.keys()];
    return ids.filter(Boolean).map((id) => ({ id, name: named.get(id) || "" }));
  } catch {
    return fallbackIds.map((id) => ({ id, name: "" }));
  }
}

export type TikTokLeadConnection = { tenantId: string; webhookToken: string; accessToken: string; advertisers: TikTokAdvertiser[]; /** advertiser id -> subscription id */ subscriptions: Record<string, string>; connectedAt: string };

type Row = { tenant_id: string; webhook_token: string; access_token: string; advertiser_ids: string; subscription_ids: string; connected_at: string };

function parseJson<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

// advertiser_ids holds the authorized accounts as JSON [{id,name}], subscription_ids the live subscriptions as JSON {advertiserId: subscriptionId}.
function rowToConnection(row: Row): TikTokLeadConnection {
  return { tenantId: row.tenant_id, webhookToken: row.webhook_token, accessToken: decryptSecret(row.access_token), advertisers: parseJson<TikTokAdvertiser[]>(row.advertiser_ids, []), subscriptions: parseJson<Record<string, string>>(row.subscription_ids, {}), connectedAt: row.connected_at };
}

export async function getTikTokLeadConnection(tenantId: string) {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT tenant_id, webhook_token, access_token, advertiser_ids, subscription_ids, connected_at FROM tiktok_lead_connections WHERE tenant_id = ${tenantId}`;
  return rows[0] ? rowToConnection(rows[0]) : null;
}

export async function findTikTokLeadConnectionByToken(token: string) {
  if (!token) return null;
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT tenant_id, webhook_token, access_token, advertiser_ids, subscription_ids, connected_at FROM tiktok_lead_connections WHERE webhook_token = ${token}`;
  return rows[0] ? rowToConnection(rows[0]) : null;
}

/**
 * Saves what the advertiser authorized: the token and the ad accounts they can pick from. Nothing is subscribed yet:
 * the workspace chooses which ad account sends it leads (see selectTikTokAdvertiser). A re-authorization keeps the
 * workspace's webhook address and the account it had chosen.
 */
export async function saveTikTokAuthorization(input: { tenantId: string; connectedBy: string; accessToken: string; advertiserIds: string[] }) {
  await ensureTable();
  const existing = await getTikTokLeadConnection(input.tenantId);
  const advertisers = await listAdvertisers(input.accessToken, input.advertiserIds);
  const token = existing?.webhookToken || randomBytes(24).toString("base64url");
  const kept = Object.fromEntries(Object.entries(existing?.subscriptions ?? {}).filter(([id]) => advertisers.some((advertiser) => advertiser.id === id)));
  const now = new Date().toISOString();
  await prisma.$executeRaw`DELETE FROM tiktok_lead_connections WHERE tenant_id = ${input.tenantId}`;
  await prisma.$executeRaw`INSERT INTO tiktok_lead_connections (tenant_id, webhook_token, access_token, advertiser_ids, subscription_ids, connected_by, connected_at) VALUES (${input.tenantId}, ${token}, ${encryptSecret(input.accessToken)}, ${JSON.stringify(advertisers)}, ${JSON.stringify(kept)}, ${input.connectedBy}, ${now})`;
  return { advertisers, selected: Object.keys(kept) };
}

async function unsubscribe(connection: TikTokLeadConnection, subscriptionId: string) {
  await post("/subscription/unsubscribe/", { app_id: tiktokAdsAppId(), secret: tiktokAdsSecret(), subscription_id: subscriptionId }, connection.accessToken).catch(() => null);
}

/** Makes `advertiserId` the one ad account that sends this workspace leads: subscribes it and cancels any other. */
export async function selectTikTokAdvertiser(tenantId: string, origin: string, advertiserId: string) {
  const connection = await getTikTokLeadConnection(tenantId);
  if (!connection) return { ok: false as const, error: "not connected" };
  if (!connection.advertisers.some((advertiser) => advertiser.id === advertiserId)) return { ok: false as const, error: "unknown ad account" };
  const subscriptions = { ...connection.subscriptions };
  if (!subscriptions[advertiserId]) {
    const result = await subscribeLeads(connection.accessToken, advertiserId, leadWebhookUrl(origin, connection.webhookToken));
    if (!result.ok) return { ok: false as const, error: result.error };
    subscriptions[advertiserId] = result.id;
  }
  for (const [id, subscriptionId] of Object.entries(subscriptions)) {
    if (id === advertiserId) continue;
    await unsubscribe(connection, subscriptionId);
    delete subscriptions[id];
  }
  await prisma.$executeRaw`UPDATE tiktok_lead_connections SET subscription_ids = ${JSON.stringify(subscriptions)} WHERE tenant_id = ${tenantId}`;
  return { ok: true as const };
}

/** Cancels the subscriptions (best effort: TikTok may already have dropped them) and forgets the connection. */
export async function disconnectTikTokLeads(tenantId: string) {
  const connection = await getTikTokLeadConnection(tenantId);
  if (!connection) return;
  for (const subscriptionId of Object.values(connection.subscriptions)) await unsubscribe(connection, subscriptionId);
  await prisma.$executeRaw`DELETE FROM tiktok_lead_connections WHERE tenant_id = ${tenantId}`;
}

// ---- A lead arriving in the webhook -------------------------------------------------------------------------------

export type TikTokLeadEntry = {
  id?: string | number;
  page_id?: string | number;
  page_name?: string;
  advertiser_id?: string | number;
  campaign_name?: string;
  ad_name?: string;
  create_time?: number;
  lead_source?: string;
  changes?: Array<{ field?: string; value?: unknown }>;
};

/** Pure: the answers of the form as question/answer pairs (field names come from the form the advertiser built). */
export function answersOf(entry: TikTokLeadEntry) {
  return (entry.changes ?? [])
    .map((change) => ({ question: String(change.field ?? "").trim(), answer: typeof change.value === "string" ? change.value.trim() : change.value == null ? "" : String(change.value) }))
    .filter((answer) => answer.question && answer.answer);
}

const pick = (answers: Array<{ question: string; answer: string }>, keys: string[]) => answers.find((answer) => keys.includes(answer.question.toUpperCase()))?.answer || "";

async function sendTikTokWelcome(input: { tenantId: string; conversationId: string; phone: string; name: string; leadId: string; summary: string }) {
  try {
    const settings = await getIntegrationSettings("tiktok", input.tenantId);
    const template = settings.leadWelcomeTemplateName?.trim();
    if (settings.leadAdsEnabled !== 1 || !template) return;
    const phone = whatsappNumberFromForm(input.phone);
    let note: string;
    if (!phone) note = "لم تُرسل رسالة الترحيب: رقم الجوال في النموذج غير صالح لواتساب";
    else {
      const result = await sendWhatsAppTemplate(input.tenantId, phone, template, "ar", input.name);
      note = result.ok ? `أُرسلت رسالة ترحيب عبر واتساب (القالب: ${template})` : `تعذر إرسال رسالة الترحيب عبر واتساب: ${result.error}`;
      if (result.ok) {
        await storeWhatsAppMessage({ phone, name: input.name, text: `أُرسلت رسالة ترحيب (القالب: ${template}) بعد تعبئة العميل نموذج تيك توك.\n${input.summary}`, direction: "out", tenantId: input.tenantId, author: "نظام" })
          .catch((error) => console.error("TikTok welcome conversation failed", error));
      }
    }
    const now = new Date();
    await prisma.message.create({ data: { id: `tt-welcome-${input.leadId}`, conversationId: input.conversationId, direction: "out", text: note, time: formatMessageTime(now), createdAt: now.toISOString(), author: "نظام" } });
  } catch (error) {
    console.error("TikTok lead welcome failed", error);
  }
}

/** Stores one TikTok lead as a customer, conversation and lead; at-least-once delivery is safe (same id = same rows). */
export async function storeTikTokLead(tenantId: string, entry: TikTokLeadEntry) {
  const leadId = String(entry.id ?? "").trim();
  if (!leadId) return null;
  await ensureSchema();
  const alreadyStored = Boolean(await prisma.lead.findUnique({ where: { id: `lead-${leadId}` }, select: { id: true } }));
  const answers = answersOf(entry);
  const activityAt = entry.create_time ? new Date(entry.create_time * 1000).toISOString() : new Date().toISOString();
  const formName = entry.page_name || entry.ad_name || entry.campaign_name || "";
  const formId = String(entry.page_id ?? "");
  const customerName = pick(answers, ["FULL_NAME", "NAME", "FIRST_NAME"]);
  const name = customerName || `عميل تيك توك ${leadId.slice(-4)}`;
  const phone = pick(answers, ["PHONE_NUMBER", "PHONE", "MOBILE"]);
  const email = pick(answers, ["EMAIL"]);
  const scopedPrefix = tenantId === "tenant-demo" ? "" : `${tenantId}-`;
  const threadPhone = leadWhatsappNumber(phone);
  const thread = threadPhone ? whatsappThreadIds(tenantId, threadPhone) : null;
  const customerId = thread?.customerId ?? `${scopedPrefix}tt-lead-${leadId}`;
  const conversationId = thread?.conversationId ?? `${scopedPrefix}tt-lead-${leadId}`;
  const summary = summarizeFormAnswers(`نموذج: ${formName || "بدون اسم"}`, answers);
  const messageId = `tt-${leadId}`;

  const result = await prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: customerId },
      update: { name, phone: threadPhone || phone, initial: firstChar(name.trim()) || "T" },
      create: { id: customerId, name, phone: threadPhone || phone, initial: firstChar(name.trim()) || "T", tenantId }
    });
    await tx.conversation.upsert({
      where: { id: conversationId },
      update: {},
      create: { id: conversationId, customerId, channel: thread ? "whatsapp" : "tiktok", lastMessage: summary, status: "unassigned", assignee: "بدون موظف", unread: 1, windowExpired: 0, lastActivityAt: activityAt, tenantId }
    });
    await tx.message.upsert({
      where: { id: messageId },
      update: {},
      create: { id: messageId, conversationId, direction: "in", text: summary, time: formatMessageTime(new Date(activityAt)), createdAt: activityAt, author: "", sourceType: "tiktok_lead_form", sourceId: formId, sourceLabel: formName }
    });
    if (!alreadyStored) await tx.conversation.update({ where: { id: conversationId }, data: { lastMessage: summary, unread: { increment: 1 }, windowExpired: 0, lastActivityAt: activityAt } });
    const lead = await tx.lead.upsert({
      where: { id: `lead-${leadId}` },
      update: {},
      create: { id: `lead-${leadId}`, tenantId, customerId, conversationId, source: "tiktok", sourceId: leadId, formId, formName, adAccountId: String(entry.advertiser_id ?? ""), name, phone, email, answersJson: JSON.stringify(answers), createdAt: activityAt }
    });
    return { conversationId, lead };
  });

  if (alreadyStored) return result;
  await recordFormAdSource({ tenantId, conversationId, platform: "tiktok", adId: String(entry.ad_name ?? ""), headline: entry.campaign_name || formName });
  await runInboundMessageAutomations(conversationId, tenantId, summary);
  const { startPlatformLeadAi } = await import("./crm-ai");
  await startPlatformLeadAi(tenantId, conversationId);
  await sendTikTokWelcome({ tenantId, conversationId, phone, name: customerName, leadId, summary });
  await triggerWebhookEvent(tenantId, "lead.created", { id: result.lead.id, source: "tiktok", customerId, conversationId, formId, formName, name, phone, email, answers, createdAt: activityAt });
  return result;
}
