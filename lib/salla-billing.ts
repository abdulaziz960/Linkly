// Subscriptions billed through Salla: a workspace created by installing Linkly from Salla's app store pays Salla
// (Salla charges the merchant and sends us app.trial.* / app.subscription.* events), never Moyasar. A workspace that
// later links a Salla store from the dashboard keeps paying through Moyasar - only a row in salla_billing marks it.
//
// Every state change comes from a Salla event, not from the browser. Each paid period is recorded as a SubscriptionPayment
// (so invoices, message credits and the plan limits work like any other payment); its id is derived from the Salla
// subscription and period, so a retried delivery never records the same period twice.

import { prisma } from "./prisma";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "./payment-status";
import { INDIVIDUALS_PLAN, LARGE_ORG_PLAN, REGULAR_PLAN, SMALL_ORG_PLAN } from "./plan-access";
import { invalidateTenantSubscriptionRow } from "./tenant-subscription-row";

let ready: Promise<void> | null = null;
export function ensureSallaBillingTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS salla_billing (
      tenant_id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      plan_name TEXT NOT NULL DEFAULT '',
      billing_cycle TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      current_period_end TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS salla_billing_merchant_idx ON salla_billing (merchant_id)`);
    // Events that arrive before the install created the workspace wait here and are replayed once it exists.
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS salla_pending_events (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    // An install whose Salla email already has a Linkly account: nothing is attached automatically; the owner confirms from the dashboard.
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS salla_pending_links (
      merchant_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      merchant_name TEXT NOT NULL DEFAULT '',
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type SallaBillingRow = { tenant_id: string; merchant_id: string; subscription_id: string; status: string; plan_name: string; billing_cycle: string; price: number; current_period_end: string };

export async function getSallaBilling(tenantId: string): Promise<SallaBillingRow | null> {
  await ensureSallaBillingTables();
  const rows = await prisma.$queryRaw<SallaBillingRow[]>`SELECT tenant_id, merchant_id, subscription_id, status, plan_name, billing_cycle, price, current_period_end FROM salla_billing WHERE tenant_id = ${tenantId} LIMIT 1`;
  return rows[0] ? { ...rows[0], price: Number(rows[0].price) } : null;
}

export async function isSallaBilled(tenantId: string): Promise<boolean> {
  return Boolean(await getSallaBilling(tenantId));
}

export async function markSallaBilled(tenantId: string, merchantId: string): Promise<void> {
  await ensureSallaBillingTables();
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO salla_billing (tenant_id, merchant_id, created_at, updated_at) VALUES (${tenantId}, ${merchantId}, ${now}, ${now}) ON CONFLICT (tenant_id) DO UPDATE SET merchant_id = ${merchantId}, updated_at = ${now}`;
}

async function updateBilling(tenantId: string, values: Partial<Omit<SallaBillingRow, "tenant_id" | "merchant_id">>) {
  const current = await getSallaBilling(tenantId);
  if (!current) return;
  const next = { ...current, ...values };
  await prisma.$executeRaw`UPDATE salla_billing SET subscription_id = ${next.subscription_id}, status = ${next.status}, plan_name = ${next.plan_name}, billing_cycle = ${next.billing_cycle}, price = ${next.price}, current_period_end = ${next.current_period_end}, updated_at = ${new Date().toISOString()} WHERE tenant_id = ${tenantId}`;
}

// ---------- Pure helpers ----------

function normalize(value: string): string {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[^a-z0-9\u0600-\u06ff ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Salla's plan name (the names we gave the plans in the app listing, Arabic or English) into the Linkly plan name; null when unknown. */
export function mapSallaPlanName(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const name = normalize(raw);
  if (/(المؤسسات الصغيره|small)/.test(name)) return SMALL_ORG_PLAN;
  if (/(المؤسسات الكبيره|large|enterprise)/.test(name)) return LARGE_ORG_PLAN;
  if (/(الافراد|individual)/.test(name)) return INDIVIDUALS_PLAN;
  if (/(العاديه|regular|standard)/.test(name)) return REGULAR_PLAN;
  return null;
}

/** Salla sends dates either as "2023-07-28" or as an ISO timestamp; a bare date lasts to the end of that day. */
export function sallaEndDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59.000Z` : text;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

/** A subscription that runs about a year is yearly, anything shorter monthly. */
export function sallaBillingCycle(start: unknown, end: unknown): "شهري" | "سنوي" {
  const from = Date.parse(String(start ?? ""));
  const to = Date.parse(String(end ?? ""));
  return Number.isFinite(from) && Number.isFinite(to) && (to - from) / 86_400_000 >= 300 ? "سنوي" : "شهري";
}

// ---------- Events ----------

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const text = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

async function planRow(name: string | null) {
  return name ? prisma.plan.findUnique({ where: { name } }) : null;
}

async function logEvent(tenantId: string, message: string, level: "معلومة" | "تنبيه" | "خطأ" = "معلومة") {
  const { logAdminAction, getTenantCompanyName } = await import("./subscriptions");
  await logAdminAction(tenantId, await getTenantCompanyName(tenantId), message, level, "سلة");
}

/** The paid period began or renewed: recorded once, then the paid-through date follows Salla's own end date. */
async function recordPaidPeriod(tenantId: string, data: Json) {
  const planName = mapSallaPlanName(data.plan_name);
  const plan = await planRow(planName);
  if (!planName || !plan) {
    await logEvent(tenantId, `وصل اشتراك من سلة باسم باقة غير معروف («${text(data.plan_name)}»). لم يتغير شيء، تحقق يدويًا.`, "خطأ");
    return "unknown plan";
  }
  const endsAt = sallaEndDate(data.end_date);
  if (!endsAt) return "no end date";
  const subscriptionId = text(data.subscription_id) || text(data.id);
  const cycle = sallaBillingCycle(data.start_date, data.end_date);
  const total = Number(data.total) || Number(data.price) || 0;
  const paymentId = `salla-${subscriptionId}-${endsAt.slice(0, 10)}`;

  if (!(await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } }))) {
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId,
        tenantId,
        amount: total,
        amountHalalas: Math.round(total * 100),
        status: PAYMENT_STATUS.pending,
        createdAt: new Date().toISOString(),
        planName,
        planEmployeeLimit: plan.employeeLimit,
        planMessageQuota: plan.messageQuota,
        billingCycle: cycle,
        listPrice: total,
        gateway: PAYMENT_GATEWAY.salla,
        gatewayPaymentId: subscriptionId,
        initiatedBy: "salla",
        metadataJson: JSON.stringify({ currency: "SAR", source: "salla", planName: text(data.plan_name), tax: data.tax_value ?? null })
      }
    });
    const { applyConfirmedSubscriptionPayment } = await import("./subscriptions");
    await applyConfirmedSubscriptionPayment(paymentId, { gateway: PAYMENT_GATEWAY.salla, gatewayStatus: "paid", gatewayPaymentId: subscriptionId, paymentMethod: "salla" });
  }
  // Salla's own end date is the truth for when the paid period ends.
  await prisma.subscription.update({ where: { tenantId }, data: { renewalAt: endsAt, plan: planName, employeeLimit: plan.employeeLimit, cancelledAt: "", status: "نشط", billingCycle: cycle } });
  invalidateTenantSubscriptionRow(tenantId);
  await updateBilling(tenantId, { subscription_id: subscriptionId, status: "active", plan_name: planName, billing_cycle: cycle, price: total, current_period_end: endsAt });
  return "period recorded";
}

/** Applies one app.* event (other than the install itself) to a workspace. */
export async function applySallaAppEvent(tenantId: string, event: string, data: Json): Promise<string> {
  await ensureSallaBillingTables();
  if (event === "app.trial.started") {
    const planName = mapSallaPlanName(data.plan_name);
    const plan = await planRow(planName);
    const endsAt = sallaEndDate(data.end_date) || new Date(Date.now() + 3 * 86_400_000).toISOString();
    await prisma.subscription.update({
      where: { tenantId },
      data: { status: "تجربة", renewalAt: endsAt, amount: 0, billingCycle: "تجربة", cancelledAt: "", ...(planName && plan ? { plan: planName, employeeLimit: plan.employeeLimit } : {}), updatedAt: new Date().toISOString() }
    });
    invalidateTenantSubscriptionRow(tenantId);
    await updateBilling(tenantId, { status: "trial", plan_name: planName ?? "", current_period_end: endsAt });
    return "trial started";
  }
  if (event === "app.trial.canceled") {
    await prisma.subscription.updateMany({ where: { tenantId, status: "تجربة" }, data: { cancelledAt: new Date().toISOString() } });
    invalidateTenantSubscriptionRow(tenantId);
    return "trial canceled";
  }
  if (event === "app.trial.expired") {
    // Subscribing starts a paid period right away; an expired trial that was followed by a subscription is already active.
    const current = await prisma.subscription.findUnique({ where: { tenantId } });
    if (current?.status === "تجربة") {
      await prisma.subscription.update({ where: { tenantId }, data: { status: "متوقف", updatedAt: new Date().toISOString() } });
      invalidateTenantSubscriptionRow(tenantId);
      await updateBilling(tenantId, { status: "trial_expired" });
      await logEvent(tenantId, "انتهت التجربة المجانية في سلة دون اشتراك. أُوقفت المساحة حتى يشترك التاجر.", "تنبيه");
    }
    return "trial expired";
  }
  if (event === "app.subscription.started" || event === "app.subscription.renewed") {
    if (text(data.item_type) && text(data.item_type) !== "plan") return "add-on ignored";
    return recordPaidPeriod(tenantId, data);
  }
  if (event === "app.subscription.canceled") {
    // Paid days stay usable until Salla's end date; the date itself is not changed.
    await prisma.subscription.updateMany({ where: { tenantId }, data: { cancelledAt: new Date().toISOString() } });
    invalidateTenantSubscriptionRow(tenantId);
    await updateBilling(tenantId, { status: "canceled" });
    await logEvent(tenantId, "ألغى التاجر الاشتراك في سلة. تبقى المزايا حتى نهاية الفترة المدفوعة.");
    return "subscription canceled";
  }
  if (event === "app.subscription.expired") {
    await prisma.subscription.update({ where: { tenantId }, data: { status: "متوقف", updatedAt: new Date().toISOString() } });
    invalidateTenantSubscriptionRow(tenantId);
    await updateBilling(tenantId, { status: "expired" });
    await logEvent(tenantId, "انتهى اشتراك سلة. أُوقفت المساحة حتى يجدد التاجر.", "تنبيه");
    return "subscription expired";
  }
  if (event === "app.uninstalled") {
    const { disconnectStore } = await import("./store-connections");
    await disconnectStore(tenantId, "salla");
    await prisma.subscription.update({ where: { tenantId }, data: { status: "متوقف", updatedAt: new Date().toISOString() } });
    invalidateTenantSubscriptionRow(tenantId);
    await updateBilling(tenantId, { status: "uninstalled" });
    await logEvent(tenantId, "أزال التاجر تطبيق Linkly من متجره في سلة. فُصل المتجر وأُوقف الاشتراك.", "تنبيه");
    return "uninstalled";
  }
  return "ignored";
}

// ---------- Events that came too early ----------

export async function queueSallaEvent(merchantId: string, payload: unknown): Promise<void> {
  await ensureSallaBillingTables();
  const id = `${merchantId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRaw`INSERT INTO salla_pending_events (id, merchant_id, payload_json, created_at) VALUES (${id}, ${merchantId}, ${JSON.stringify(payload)}, ${new Date().toISOString()})`;
}

/** Replays what arrived before the workspace existed, oldest first. */
export async function replayQueuedSallaEvents(merchantId: string, tenantId: string): Promise<number> {
  await ensureSallaBillingTables();
  const rows = await prisma.$queryRaw<Array<{ id: string; payload_json: string }>>`SELECT id, payload_json FROM salla_pending_events WHERE merchant_id = ${merchantId} ORDER BY created_at ASC`;
  let replayed = 0;
  for (const row of rows) {
    try {
      const payload = obj(JSON.parse(row.payload_json));
      await applySallaAppEvent(tenantId, text(payload.event), obj(payload.data));
      replayed += 1;
    } catch (error) {
      console.error("Replaying a Salla event failed", { merchantId, error });
    }
    await prisma.$executeRaw`DELETE FROM salla_pending_events WHERE id = ${row.id}`;
  }
  return replayed;
}
