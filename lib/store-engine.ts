import { createHash } from "crypto";
import { sendBotText } from "./bot-engine";
import { sendWhatsAppTemplate } from "./campaign-engine";
import { prisma } from "./prisma";
import { findSallaOrderByReference, parseSallaWebhook, type StoreCart, type StoreEvent, type StoreOrder } from "./salla";
import { createZidCoupon, fetchZidCart, fetchZidOrder, findZidOrderByReference, parseZidWebhook, uniqueCouponCode } from "./zid";
import { findShopifyOrderByReference, parseShopifyWebhook } from "./shopify";
import { disconnectStore, findTenantByMerchant, readStoreTokens } from "./store-connections";
import { STORES, getStoreSettings, type OrderEvent, type StatusGroup, type StoreKey, type StoreSettings } from "./store-settings";

/**
 * The store engine: what happens when a store tells us something (order created / status changed /
 * cart abandoned) and when a customer asks about their order in a conversation.
 *
 * Template variables are positional, in this fixed order (documented on the settings screen):
 *   order messages : {{1}} customer name, {{2}} order number, {{3}} status, {{4}} tracking link ("-" when none)
 *   cart reminders : {{1}} customer name, {{2}} cart total, {{3}} link to finish the order, {{4}} discount code ("" when none)
 */

const RIYADH_OFFSET_MINUTES = 3 * 60;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS store_event_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      store TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      ok INTEGER NOT NULL DEFAULT 0,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS store_order_verification (
      conversation_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      reference TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS store_cart_reminders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      store TEXT NOT NULL,
      cart_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      total REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'SAR',
      url TEXT NOT NULL DEFAULT '',
      step INTEGER NOT NULL DEFAULT 0,
      next_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

// ---------- pure helpers ----------

/** Store status (Salla slug or label) -> the group the customer-facing texts are written for. */
export function orderStatusGroup(slug: string, label = ""): StatusGroup {
  const key = `${slug} ${label}`.toLowerCase();
  if (/cancel|ملغ|restor|مسترج/.test(key)) return "cancelled";
  // Zid's "indelivery" (on its way) contains "deliver" and must not read as delivered.
  if (/in_?delivery|shipp|delivering|out_for|جاري التوصيل|تم الشحن|قيد التوصيل/.test(key)) return "shipped";
  if (/deliver|complet|تم التسليم|مكتمل|تم التوصيل/.test(key) && !/delivering|جاري/.test(key)) return "delivered";
  if (/in_progress|processing|prepar|قيد التنفيذ|قيد التجهيز|جاري التجهيز/.test(key)) return "processing";
  if (/under_review|review|pending|قيد المراجعة|بانتظار/.test(key)) return "review";
  return "other";
}

const NOTIFICATION_FOR_GROUP: Partial<Record<StatusGroup, OrderEvent>> = {
  processing: "processing",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled"
};

export function renderOrderText(template: string, order: StoreOrder): string {
  const values: Record<string, string> = {
    order: order.reference,
    status: order.statusLabel || order.statusSlug,
    name: order.customerName,
    company: order.shippingCompany ? `\nشركة الشحن: ${order.shippingCompany}` : "",
    tracking: order.trackingNumber ? `\nرقم التتبع: ${order.trackingNumber}` : "",
    link: order.trackingUrl ? `\nتتبع الشحنة: ${order.trackingUrl}` : ""
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => values[key] ?? "").trim();
}

/** Last 9 digits: enough to tell 05xxxxxxxx / 5xxxxxxxx / 9665xxxxxxxx apart from other people's numbers. */
export function samePhone(a: string, b: string): boolean {
  const left = a.replace(/\D/g, "").slice(-9);
  const right = b.replace(/\D/g, "").slice(-9);
  return left.length === 9 && left === right;
}

const TRACK_WORDS = /(وين\s*(طلب|شحن)|طلبي|شحنتي|شحنتك|تتبع|حالة\s*(ال)?طلب|رقم\s*(ال)?طلب|رقم\s*(ال)?شحن|order\s*status|track|where\s*is\s*my)/i;

/** The order number in the message, when it is plausibly one (4-12 digits, not a phone number). */
export function extractOrderReference(text: string): string {
  const arabicDigits = text.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const matches = [...arabicDigits.matchAll(/(?<![\d+])(\d{4,12})(?!\d)/g)].map((match) => match[1]);
  return matches.find((digits) => !/^(05\d{8}|5\d{8}|9665\d{8})$/.test(digits)) ?? "";
}

export function looksLikeOrderQuestion(text: string): boolean {
  return TRACK_WORDS.test(text);
}

/** Quiet hours in Riyadh time: when `now` falls inside, the moment the window ends (else null). */
export function quietHoursEnd(now: Date, quiet: { enabled: boolean; start: string; end: string }): Date | null {
  if (!quiet.enabled) return null;
  const local = new Date(now.getTime() + RIYADH_OFFSET_MINUTES * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return null;
  const inside = start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  if (!inside) return null;
  let wait = end - minutes;
  if (wait <= 0) wait += 24 * 60;
  return new Date(now.getTime() + wait * 60_000 - local.getUTCSeconds() * 1000);
}

// ---------- sending ----------

async function logEvent(tenantId: string, store: StoreKey, kind: string, ref: string, phone: string, ok: boolean, detail = ""): Promise<void> {
  await ensureTables();
  const id = `sev-${createHash("sha1").update(`${tenantId}:${store}:${kind}:${ref}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 24)}`;
  await prisma.$executeRaw`INSERT INTO store_event_log (id, tenant_id, store, kind, ref, phone, ok, detail, created_at) VALUES (${id}, ${tenantId}, ${store}, ${kind}, ${ref}, ${phone}, ${ok ? 1 : 0}, ${detail.slice(0, 300)}, ${new Date().toISOString()})`;
}

async function alreadyDone(tenantId: string, store: StoreKey, kind: string, ref: string): Promise<boolean> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM store_event_log WHERE tenant_id = ${tenantId} AND store = ${store} AND kind = ${kind} AND ref = ${ref} AND ok = 1 LIMIT 1`;
  return rows.length > 0;
}

async function sentToday(tenantId: string, store: StoreKey): Promise<number> {
  await ensureTables();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = await prisma.$queryRaw<Array<{ n: number | bigint }>>`SELECT COUNT(*) AS n FROM store_event_log WHERE tenant_id = ${tenantId} AND store = ${store} AND ok = 1 AND kind IN ('notify', 'cart') AND created_at >= ${since}`;
  return Number(rows[0]?.n ?? 0);
}

async function optedOutOfMarketing(tenantId: string, phone: string): Promise<boolean> {
  const customer = await prisma.customer.findFirst({ where: { tenantId, phone }, select: { marketingOptOut: true } });
  return customer?.marketingOptOut === 1;
}

async function sendOrderNotification(tenantId: string, store: StoreKey, event: OrderEvent, order: StoreOrder, settings: StoreSettings): Promise<string> {
  const item = settings.orderNotifications[event];
  if (!item.enabled || !item.template) return "off";
  if (!order.customerPhone) return "no-phone";
  const ref = `${order.id}:${event}`;
  if (await alreadyDone(tenantId, store, "notify", ref)) return "duplicate";
  if (settings.dailyCap > 0 && (await sentToday(tenantId, store)) >= settings.dailyCap) return "daily-cap";
  const result = await sendWhatsAppTemplate(tenantId, order.customerPhone, item.template, "ar", order.customerName, "", false, "", [order.customerName || "عميلنا", order.reference, order.statusLabel || order.statusSlug, order.trackingUrl || "-"]);
  await logEvent(tenantId, store, "notify", ref, order.customerPhone, result.ok, result.ok ? "" : result.error);
  return result.ok ? "sent" : "failed";
}

async function scheduleCartReminders(tenantId: string, store: StoreKey, cart: StoreCart, settings: StoreSettings): Promise<string> {
  const rules = settings.abandonedCart;
  if (!rules.enabled) return "off";
  if (!cart.customerPhone) return "no-phone";
  if (cart.total < rules.minCartValue) return "below-minimum";
  await ensureTables();
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM store_cart_reminders WHERE tenant_id = ${tenantId} AND store = ${store} AND cart_id = ${cart.id} LIMIT 1`;
  if (existing.length) return "duplicate";
  const now = new Date();
  const nextAt = new Date(now.getTime() + rules.delayMinutes * 60_000).toISOString();
  const id = `scr-${createHash("sha1").update(`${tenantId}:${store}:${cart.id}`).digest("hex").slice(0, 24)}`;
  await prisma.$executeRaw`INSERT INTO store_cart_reminders (id, tenant_id, store, cart_id, phone, name, total, currency, url, step, next_at, status, created_at, updated_at) VALUES (${id}, ${tenantId}, ${store}, ${cart.id}, ${cart.customerPhone}, ${cart.customerName}, ${cart.total}, ${cart.currency}, ${cart.url}, 0, ${nextAt}, 'pending', ${now.toISOString()}, ${now.toISOString()})`;
  return "scheduled";
}

/** A new order from this phone ends any open cart reminders: they already bought. */
async function cancelCartReminders(tenantId: string, store: StoreKey, phone: string): Promise<void> {
  if (!phone) return;
  await ensureTables();
  await prisma.$executeRaw`UPDATE store_cart_reminders SET status = 'cancelled', updated_at = ${new Date().toISOString()} WHERE tenant_id = ${tenantId} AND store = ${store} AND phone = ${phone} AND status = 'pending'`;
}

async function orderedRecently(tenantId: string, store: StoreKey, phone: string, days: number): Promise<boolean> {
  if (days <= 0) return false;
  await ensureTables();
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM store_event_log WHERE tenant_id = ${tenantId} AND store = ${store} AND kind = 'order' AND phone = ${phone} AND created_at >= ${since} LIMIT 1`;
  return rows.length > 0;
}

export type WebhookOutcome = { handled: boolean; status: number; detail?: string };

/** Applies one store event for a workspace. Never throws. */
export async function applyStoreEvent(tenantId: string, store: StoreKey, event: StoreEvent): Promise<string> {
  try {
    const { settings } = await getStoreSettings(tenantId, store);
    if (event.type === "order.created") {
      await logEvent(tenantId, store, "order", event.order.id, event.order.customerPhone, true);
      await cancelCartReminders(tenantId, store, event.order.customerPhone);
      return sendOrderNotification(tenantId, store, "created", event.order, settings);
    }
    if (event.type === "order.status.updated") {
      const group = orderStatusGroup(event.order.statusSlug, event.order.statusLabel);
      const notification = NOTIFICATION_FOR_GROUP[group];
      return notification ? sendOrderNotification(tenantId, store, notification, event.order, settings) : "no-notification";
    }
    if (event.type === "abandoned.cart") {
      if (await orderedRecently(tenantId, store, event.cart.customerPhone, settings.abandonedCart.skipIfOrderedDays)) return "ordered-recently";
      return scheduleCartReminders(tenantId, store, event.cart, settings);
    }
    return "ignored";
  } catch (error) {
    console.error("Store event failed", error);
    return "error";
  }
}

/** Workspaces that have a cart reminder due now (what the cron should visit). */
export async function tenantsWithDueCartReminders(limit = 50): Promise<string[]> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT DISTINCT tenant_id FROM store_cart_reminders WHERE status = 'pending' AND next_at <= ${new Date().toISOString()} LIMIT ${limit}`;
  return rows.map((row) => row.tenant_id);
}

/** Sends the due cart reminders of a workspace (called from the cron). Returns how many went out. */
export async function processStoreCartReminders(tenantId: string, limit = 25): Promise<number> {
  await ensureTables();
  const due = await prisma.$queryRaw<Array<{ id: string; store: string; cart_id: string; phone: string; name: string; total: number; url: string; step: number }>>`SELECT id, store, cart_id, phone, name, total, url, step FROM store_cart_reminders WHERE tenant_id = ${tenantId} AND status = 'pending' AND next_at <= ${new Date().toISOString()} ORDER BY next_at ASC LIMIT ${limit}`;
  let sent = 0;
  for (const row of due) {
    const store = row.store as StoreKey;
    const stamp = new Date().toISOString();
    const finish = async (status: string) => {
      await prisma.$executeRaw`UPDATE store_cart_reminders SET status = ${status}, updated_at = ${stamp} WHERE id = ${row.id}`;
    };
    try {
      const { settings } = await getStoreSettings(tenantId, store);
      const rules = settings.abandonedCart;
      if (!rules.enabled) { await finish("cancelled"); continue; }
      if (await orderedRecently(tenantId, store, row.phone, 1)) { await finish("cancelled"); continue; }
      if (await optedOutOfMarketing(tenantId, row.phone)) { await finish("cancelled"); continue; }
      const quietEnd = quietHoursEnd(new Date(), rules.quietHours);
      if (quietEnd) {
        await prisma.$executeRaw`UPDATE store_cart_reminders SET next_at = ${quietEnd.toISOString()}, updated_at = ${stamp} WHERE id = ${row.id}`;
        continue;
      }
      if (settings.dailyCap > 0 && (await sentToday(tenantId, store)) >= settings.dailyCap) continue;
      const template = rules.templates[row.step];
      if (!template) { await finish("done"); continue; }
      const isLast = row.step + 1 >= rules.maxReminders;
      let discount = isLast ? rules.discountCode : "";
      // A fresh single-use coupon for this customer replaces the shared code (Zid; the shared code stays as the fallback).
      if (isLast && store === "zid" && rules.uniqueCoupon.enabled) {
        const coupon = await createZidCoupon(tenantId, { code: uniqueCouponCode(), percent: rules.uniqueCoupon.percent, validHours: rules.uniqueCoupon.validHours });
        if (coupon) discount = coupon.code;
        else console.error("Zid unique coupon could not be created; using the shared code", tenantId);
      }
      const result = await sendWhatsAppTemplate(tenantId, row.phone, template, "ar", row.name, "", false, "", [row.name || "عميلنا", String(Math.round(row.total)), row.url || "-", discount]);
      await logEvent(tenantId, store, "cart", `${row.cart_id}:${row.step + 1}`, row.phone, result.ok, result.ok ? "" : result.error);
      if (result.ok) sent += 1;
      if (!result.ok || isLast) {
        await finish(result.ok ? "done" : "failed");
      } else {
        const nextAt = new Date(Date.now() + rules.intervalHours * 3600_000).toISOString();
        await prisma.$executeRaw`UPDATE store_cart_reminders SET step = ${row.step + 1}, next_at = ${nextAt}, updated_at = ${stamp} WHERE id = ${row.id}`;
      }
    } catch (error) {
      console.error("Cart reminder failed", error);
    }
  }
  return sent;
}

function findStoreOrderByReference(store: StoreKey, tenantId: string, reference: string): Promise<StoreOrder | null> {
  if (store === "zid") return findZidOrderByReference(tenantId, reference);
  if (store === "shopify") return findShopifyOrderByReference(tenantId, reference);
  return findSallaOrderByReference(tenantId, reference);
}

// ---------- webhook entry ----------

export async function handleSallaWebhook(body: unknown): Promise<WebhookOutcome> {
  const event = parseSallaWebhook(body);
  const tenantId = await findTenantByMerchant("salla", event.merchantId);
  if (!tenantId) return { handled: false, status: 202, detail: "unknown merchant" };
  const detail = await applyStoreEvent(tenantId, "salla", event);
  return { handled: true, status: 200, detail };
}

/** Shopify's orders / checkouts / uninstall events. The shop domain identifies the workspace. */
export async function handleShopifyWebhook(topic: string, shop: string, body: unknown): Promise<WebhookOutcome> {
  const tenantId = await findTenantByMerchant("shopify", shop);
  if (!tenantId) return { handled: false, status: 202, detail: "unknown shop" };
  if (topic === "app/uninstalled") {
    await disconnectStore(tenantId, "shopify");
    return { handled: true, status: 200, detail: "disconnected" };
  }
  const event = parseShopifyWebhook(topic, shop, body);
  const detail = await applyStoreEvent(tenantId, "shopify", event);
  return { handled: true, status: 200, detail };
}

/**
 * Shopify's mandatory privacy webhooks. What a workspace holds from a shop is the phone and name in its
 * event log and pending cart reminders; an erasure removes them, a data request is recorded for the
 * merchant (nothing is sent to the shopper from here).
 */
export async function handleShopifyPrivacyWebhook(topic: string, shop: string, body: unknown): Promise<WebhookOutcome> {
  const tenantId = await findTenantByMerchant("shopify", shop, { includeDisconnected: true });
  if (!tenantId) return { handled: true, status: 200, detail: "nothing held for this shop" };
  await ensureTables();
  if (topic === "shop/redact") {
    await prisma.$executeRaw`DELETE FROM store_cart_reminders WHERE tenant_id = ${tenantId} AND store = 'shopify'`;
    await prisma.$executeRaw`DELETE FROM store_event_log WHERE tenant_id = ${tenantId} AND store = 'shopify'`;
    await disconnectStore(tenantId, "shopify");
    return { handled: true, status: 200, detail: "shop erased" };
  }
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const customer = (raw.customer && typeof raw.customer === "object" ? raw.customer : {}) as Record<string, unknown>;
  const phone = typeof customer.phone === "string" ? customer.phone.replace(/\D/g, "") : "";
  if (topic === "customers/redact") {
    const tail = phone.slice(-9);
    if (tail.length === 9) {
      const pattern = `%${tail}`;
      await prisma.$executeRaw`DELETE FROM store_cart_reminders WHERE tenant_id = ${tenantId} AND store = 'shopify' AND phone LIKE ${pattern}`;
      await prisma.$executeRaw`DELETE FROM store_event_log WHERE tenant_id = ${tenantId} AND store = 'shopify' AND phone LIKE ${pattern}`;
    }
    return { handled: true, status: 200, detail: "customer erased" };
  }
  if (topic === "customers/data_request") {
    await logEvent(tenantId, "shopify", "privacy-request", String(customer.id ?? ""), phone, true, "customers/data_request");
    return { handled: true, status: 200, detail: "recorded" };
  }
  return { handled: true, status: 200, detail: "ignored" };
}

/**
 * Zid's delivery carries (at most) the record's id: the workspace and event come from our own signed
 * callback URL, and the full order / cart is re-read through the API so we do not depend on the webhook's
 * payload shape. Falls back to whatever the body itself held.
 */
/** A Zid order we created from the WhatsApp catalog: confirm it as paid once Zid says so (re-checked with Zid). */
async function reconcileCatalogOrderFromZid(tenantId: string, zidOrderId: string): Promise<void> {
  if (!zidOrderId) return;
  const { processOrderPaymentCallback } = await import("./catalog-payments");
  const row = await prisma.catalogOrder.findFirst({ where: { tenantId, paymentId: `zid-${zidOrderId}`, status: "awaiting_payment" }, select: { id: true } });
  if (row) await processOrderPaymentCallback(row.id).catch((error) => console.error("Zid order payment reconcile failed", error));
}

export async function handleZidWebhook(tenantId: string, eventName: string, body: unknown): Promise<WebhookOutcome> {
  // Payment changes only matter for the orders we created ourselves; nothing is sent to the customer here.
  if (eventName === "order.payment_status.update") {
    const raw = (body && typeof body === "object" ? (body as Record<string, unknown>) : {}) as Record<string, unknown>;
    const nested = (raw.order && typeof raw.order === "object" ? raw.order : raw.data && typeof raw.data === "object" ? raw.data : {}) as Record<string, unknown>;
    await reconcileCatalogOrderFromZid(tenantId, String(raw.id ?? nested.id ?? ""));
    return { handled: true, status: 200, detail: "payment-checked" };
  }
  let event = parseZidWebhook(eventName, body);
  if (event.type === "order.created" || event.type === "order.status.updated") {
    const full = await fetchZidOrder(tenantId, event.order.id);
    if (full) {
      // A status update's new status may be newer than what the read returned a moment ago; keep the API's view.
      event = { ...event, order: { ...event.order, ...Object.fromEntries(Object.entries(full).filter(([, value]) => value !== "" && value !== 0)) } as StoreOrder };
    }
    await reconcileCatalogOrderFromZid(tenantId, event.order.id);
    if (!event.order.customerPhone) return { handled: true, status: 200, detail: "no-phone" };
  } else if (event.type === "abandoned.cart") {
    const full = event.cart.customerPhone && event.cart.url ? null : await fetchZidCart(tenantId, event.cart.id);
    if (full) event = { ...event, cart: { ...event.cart, ...Object.fromEntries(Object.entries(full).filter(([, value]) => value !== "" && value !== 0)) } as StoreCart };
    if (!event.cart.customerPhone) return { handled: true, status: 200, detail: "no-phone" };
  }
  const detail = await applyStoreEvent(tenantId, "zid", event);
  return { handled: true, status: 200, detail };
}

// ---------- order questions in the conversation ----------

/**
 * When the customer asks where their order is: finds it in the store and answers in the chat.
 * Returns true when it handled the message (so the bot does not also answer). Only answers with the
 * order's details when the order's phone is this conversation's phone (unless the workspace turned that off).
 */
const VERIFY_MINUTES = 10;
const VERIFY_MAX_ATTEMPTS = 3;

function lastFourDigits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}

async function setPendingVerification(tenantId: string, conversationId: string, reference: string): Promise<void> {
  await ensureTables();
  const expires = new Date(Date.now() + VERIFY_MINUTES * 60_000).toISOString();
  await prisma.$executeRaw`DELETE FROM store_order_verification WHERE conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO store_order_verification (conversation_id, tenant_id, reference, attempts, expires_at) VALUES (${conversationId}, ${tenantId}, ${reference}, 0, ${expires})`;
}

async function getPendingVerification(conversationId: string): Promise<{ reference: string; attempts: number } | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ reference: string; attempts: number; expires_at: string }>>`SELECT reference, attempts, expires_at FROM store_order_verification WHERE conversation_id = ${conversationId}`;
  const row = rows[0];
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    await prisma.$executeRaw`DELETE FROM store_order_verification WHERE conversation_id = ${conversationId}`;
    return null;
  }
  return { reference: row.reference, attempts: Number(row.attempts) };
}

async function clearPendingVerification(conversationId: string): Promise<void> {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM store_order_verification WHERE conversation_id = ${conversationId}`;
}

async function bumpPendingVerification(conversationId: string): Promise<void> {
  await ensureTables();
  await prisma.$executeRaw`UPDATE store_order_verification SET attempts = attempts + 1 WHERE conversation_id = ${conversationId}`;
}

export async function handleOrderInquiry(input: { tenantId: string; conversationId: string; phone: string; text: string }): Promise<boolean> {
  try {
    const text = input.text.trim();
    if (!text || text.length > 400) return false;

    // The answer to "send the last 4 digits" is a bare number, so it is checked before the question detection below.
    const pending = await getPendingVerification(input.conversationId);
    const digitsOnly = /^\D*(\d{4})\D*$/.exec(text)?.[1] ?? "";
    if (pending && digitsOnly) return answerPendingVerification(input, pending, digitsOnly);

    const reference = extractOrderReference(text);
    const asking = looksLikeOrderQuestion(text);
    if (!asking && !(reference && /طلب|order/i.test(text))) return false;

    // The store this workspace connected (Salla first, then Zid).
    let store: StoreKey | null = null;
    for (const candidate of STORES) {
      if (await readStoreTokens(input.tenantId, candidate)) {
        store = candidate;
        break;
      }
    }
    if (!store) return false;
    const { settings } = await getStoreSettings(input.tenantId, store);
    if (!settings.orderLookup.enabled) return false;

    const send = (message: string) => sendBotText("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone, text: message, author: "الرد الآلي" });

    if (!reference) {
      await send(settings.orderLookup.askNumberText);
      return true;
    }
    const order = await findStoreOrderByReference(store, input.tenantId, reference);
    const allowed = order && (!settings.orderLookup.requirePhoneMatch || samePhone(order.customerPhone, input.phone));
    if (!order || !allowed) {
      // From another phone: ask for the last 4 digits of the phone on the order. The question is the same
      // whether the order exists or not, so it gives nothing away; the answer is what is checked.
      if (settings.orderLookup.requirePhoneMatch && settings.orderLookup.verifyWithLastDigits) {
        await setPendingVerification(input.tenantId, input.conversationId, reference);
        await send(settings.orderLookup.askDigitsText);
        return true;
      }
      // The same answer whether it does not exist or belongs to someone else: no hint about other people's orders.
      await send(settings.orderLookup.notFoundText);
      return true;
    }
    const group = orderStatusGroup(order.statusSlug, order.statusLabel);
    await send(renderOrderText(settings.orderLookup.texts[group], order));
    return true;
  } catch (error) {
    console.error("Order inquiry failed", error);
    return false;
  }
}

/** The customer answered the "last 4 digits" question: show the order only if they match the phone on it. */
async function answerPendingVerification(
  input: { tenantId: string; conversationId: string; phone: string },
  pending: { reference: string; attempts: number },
  digits: string
): Promise<boolean> {
  let store: StoreKey | null = null;
  for (const candidate of STORES) {
    if (await readStoreTokens(input.tenantId, candidate)) {
      store = candidate;
      break;
    }
  }
  if (!store) {
    await clearPendingVerification(input.conversationId);
    return false;
  }
  const { settings } = await getStoreSettings(input.tenantId, store);
  const send = (message: string) => sendBotText("whatsapp", { tenantId: input.tenantId, conversationId: input.conversationId, recipientId: input.phone, text: message, author: "الرد الآلي" });

  const order = await findStoreOrderByReference(store, input.tenantId, pending.reference);
  if (order && order.customerPhone && lastFourDigits(order.customerPhone) === digits) {
    await clearPendingVerification(input.conversationId);
    const group = orderStatusGroup(order.statusSlug, order.statusLabel);
    await send(renderOrderText(settings.orderLookup.texts[group], order));
    return true;
  }
  // Wrong digits (or no such order): the same refusal, and only a few tries.
  if (pending.attempts + 1 >= VERIFY_MAX_ATTEMPTS) await clearPendingVerification(input.conversationId);
  else await bumpPendingVerification(input.conversationId);
  await send(settings.orderLookup.notFoundText);
  return true;
}
