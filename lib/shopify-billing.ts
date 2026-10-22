import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { type BillingCycle } from "./billing-pricing";
import { shopifyIntervalFor, shopifyPriceForCycle } from "./shopify-pricing";

export { shopifyIntervalFor, shopifyPriceForCycle };
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "./payment-status";
import { readStoreTokens } from "./store-connections";
import { SHOPIFY_API_VERSION, isShopifyShopDomain } from "./shopify";

/**
 * Subscriptions billed through Shopify (docs/shopify-billing-design.md).
 *
 * A workspace that was created by installing Linkly from a Shopify store is "Shopify-billed": it has a row
 * in shopify_billing and pays through the Shopify Billing API (the charge lands on the merchant's Shopify
 * invoice). Every other workspace - including one that later links a Shopify store from the dashboard -
 * keeps paying through Moyasar.
 *
 * Flow: checkout stages a SubscriptionPayment exactly like the Moyasar path (benefits never precede
 * payment), creates an AppSubscription and sends the owner to Shopify's confirmation page. When the owner
 * approves, the return route (or the app_subscriptions/update webhook, whichever comes first) re-reads the
 * subscription from Shopify, checks it is ACTIVE at the staged price and interval, and only then applies the
 * payment through applyConfirmedSubscriptionPayment. Renewals: Shopify charges by itself every period; the
 * cron reads currentPeriodEnd and records each new period (syncShopifyRenewals).
 *
 * Prices are set in US dollars per plan (shopify_plan_prices, edited in the admin plans page); yearly uses
 * the same discount as the Moyasar path.
 */

const SAR_PER_USD = 3.75;

let ready: Promise<void> | null = null;
export function ensureShopifyBillingTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS shopify_billing (
      tenant_id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      app_subscription_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      plan_name TEXT NOT NULL DEFAULT '',
      billing_cycle TEXT NOT NULL DEFAULT '',
      price_usd REAL NOT NULL DEFAULT 0,
      current_period_end TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS shopify_billing_shop_idx ON shopify_billing (shop)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS shopify_plan_prices (
      plan_id TEXT PRIMARY KEY,
      monthly_usd REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type ShopifyBillingRow = {
  tenant_id: string;
  shop: string;
  app_subscription_id: string;
  status: string;
  plan_name: string;
  billing_cycle: string;
  price_usd: number;
  current_period_end: string;
};

export async function getShopifyBilling(tenantId: string): Promise<ShopifyBillingRow | null> {
  await ensureShopifyBillingTables();
  const rows = await prisma.$queryRaw<ShopifyBillingRow[]>`SELECT tenant_id, shop, app_subscription_id, status, plan_name, billing_cycle, price_usd, current_period_end FROM shopify_billing WHERE tenant_id = ${tenantId} LIMIT 1`;
  return rows[0] ? { ...rows[0], price_usd: Number(rows[0].price_usd) } : null;
}

export async function isShopifyBilled(tenantId: string): Promise<boolean> {
  return Boolean(await getShopifyBilling(tenantId));
}

/** Marks a workspace as Shopify-billed (called once, when the install creates it). */
export async function markShopifyBilled(tenantId: string, shop: string): Promise<void> {
  await ensureShopifyBillingTables();
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO shopify_billing (tenant_id, shop, created_at, updated_at) VALUES (${tenantId}, ${shop}, ${now}, ${now}) ON CONFLICT (tenant_id) DO UPDATE SET shop = ${shop}, updated_at = ${now}`;
}

async function updateBillingRow(tenantId: string, values: Partial<Omit<ShopifyBillingRow, "tenant_id" | "shop">>): Promise<void> {
  const current = await getShopifyBilling(tenantId);
  if (!current) return;
  const next = { ...current, ...values };
  const now = new Date().toISOString();
  await prisma.$executeRaw`UPDATE shopify_billing SET app_subscription_id = ${next.app_subscription_id}, status = ${next.status}, plan_name = ${next.plan_name}, billing_cycle = ${next.billing_cycle}, price_usd = ${next.price_usd}, current_period_end = ${next.current_period_end}, updated_at = ${now} WHERE tenant_id = ${tenantId}`;
}

// ---------- Prices ----------

export async function getShopifyPlanPrices(): Promise<Record<string, number>> {
  await ensureShopifyBillingTables();
  const rows = await prisma.$queryRaw<Array<{ plan_id: string; monthly_usd: number }>>`SELECT plan_id, monthly_usd FROM shopify_plan_prices`;
  return Object.fromEntries(rows.map((row) => [row.plan_id, Number(row.monthly_usd)]));
}

export async function setShopifyPlanPrice(planId: string, monthlyUsd: number): Promise<void> {
  await ensureShopifyBillingTables();
  const price = Math.max(0, Math.round(monthlyUsd * 100) / 100);
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO shopify_plan_prices (plan_id, monthly_usd, updated_at) VALUES (${planId}, ${price}, ${now}) ON CONFLICT (plan_id) DO UPDATE SET monthly_usd = ${price}, updated_at = ${now}`;
}

// ---------- Admin GraphQL ----------

type Json = Record<string, unknown>;
type GraphqlResult = { ok: boolean; data: Json; errors: string[] };

async function graphql(shop: string, token: string, query: string, variables: Json): Promise<GraphqlResult> {
  try {
    const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000)
    });
    const payload = (await response.json().catch(() => null)) as { data?: Json; errors?: Array<{ message?: string }> } | null;
    const errors = (payload?.errors || []).map((error) => error.message || "GraphQL error");
    return { ok: response.ok && !errors.length, data: payload?.data || {}, errors };
  } catch {
    return { ok: false, data: {}, errors: ["تعذر الاتصال بشوبيفاي"] };
  }
}

async function shopConnection(tenantId: string): Promise<{ shop: string; token: string } | null> {
  const tokens = await readStoreTokens(tenantId, "shopify");
  if (!tokens || !isShopifyShopDomain(tokens.merchantId) || !tokens.accessToken) return null;
  return { shop: tokens.merchantId, token: tokens.accessToken };
}

/** Development and partner-test stores can only take test charges; SHOPIFY_BILLING_TEST=1 forces them everywhere. */
async function isTestShop(shop: string, token: string): Promise<boolean> {
  if (process.env.SHOPIFY_BILLING_TEST === "1") return true;
  const result = await graphql(shop, token, "query { shop { plan { partnerDevelopment } } }", {});
  const plan = ((result.data.shop as Json | undefined)?.plan || {}) as Json;
  return plan.partnerDevelopment === true;
}

export type ShopifyAppSubscription = {
  id: string;
  status: string;
  test: boolean;
  currentPeriodEnd: string;
  amount: number;
  currency: string;
  interval: string;
};

const SUBSCRIPTION_FIELDS = `id status test currentPeriodEnd lineItems { plan { pricingDetails { __typename ... on AppRecurringPricing { interval price { amount currencyCode } } } } }`;

function toAppSubscription(node: Json | undefined): ShopifyAppSubscription | null {
  if (!node || typeof node.id !== "string") return null;
  const items = Array.isArray(node.lineItems) ? (node.lineItems as Json[]) : [];
  const pricing = (((items[0]?.plan as Json | undefined)?.pricingDetails) || {}) as Json;
  const price = (pricing.price || {}) as Json;
  return {
    id: node.id,
    status: String(node.status || ""),
    test: node.test === true,
    currentPeriodEnd: typeof node.currentPeriodEnd === "string" ? node.currentPeriodEnd : "",
    amount: Number(price.amount || 0),
    currency: String(price.currencyCode || ""),
    interval: String(pricing.interval || "")
  };
}

export async function fetchAppSubscription(shop: string, token: string, id: string): Promise<ShopifyAppSubscription | null> {
  const result = await graphql(shop, token, `query ($id: ID!) { node(id: $id) { ... on AppSubscription { ${SUBSCRIPTION_FIELDS} } } }`, { id });
  return result.ok ? toAppSubscription(result.data.node as Json | undefined) : null;
}

// ---------- Checkout ----------

export type ShopifyCheckoutResult = { confirmationUrl: string; paymentId: string } | { error: string; status: number };

export async function startShopifyCheckout(input: {
  tenantId: string;
  userId: string;
  plan: { id: string; name: string; employeeLimit: number; messageQuota: number };
  billingCycle: BillingCycle;
  returnOrigin: string;
}): Promise<ShopifyCheckoutResult> {
  const interval = shopifyIntervalFor(input.billingCycle);
  if (!interval) return { error: "اختر الدفع الشهري أو السنوي", status: 400 };
  const monthlyUsd = (await getShopifyPlanPrices())[input.plan.id] || 0;
  if (monthlyUsd <= 0) return { error: "هذه الباقة غير متاحة للدفع عبر شوبيفاي بعد. تواصل معنا.", status: 400 };
  const connection = await shopConnection(input.tenantId);
  if (!connection) return { error: "متجر شوبيفاي غير مربوط. أعد تثبيت التطبيق من متجرك.", status: 409 };

  const priceUsd = shopifyPriceForCycle(monthlyUsd, input.billingCycle);
  const test = await isTestShop(connection.shop, connection.token);
  const paymentId = randomUUID();
  const sarEquivalent = Math.round(priceUsd * SAR_PER_USD * 100) / 100;
  const now = new Date().toISOString();

  // Staged first, like the Moyasar path: the plan is only applied once Shopify reports the charge ACTIVE.
  await prisma.subscriptionPayment.create({
    data: {
      id: paymentId,
      tenantId: input.tenantId,
      amount: sarEquivalent,
      amountHalalas: Math.round(sarEquivalent * 100),
      status: PAYMENT_STATUS.pending,
      createdAt: now,
      planName: input.plan.name,
      planEmployeeLimit: input.plan.employeeLimit,
      planMessageQuota: input.plan.messageQuota,
      billingCycle: input.billingCycle,
      listPrice: sarEquivalent,
      gateway: PAYMENT_GATEWAY.shopify,
      initiatedBy: input.userId,
      metadataJson: JSON.stringify({ currency: "USD", priceUsd, interval, shop: connection.shop, test, sarPerUsd: SAR_PER_USD })
    }
  });

  const returnUrl = `${input.returnOrigin}/api/billing/shopify/return?payment=${encodeURIComponent(paymentId)}`;
  const result = await graphql(connection.shop, connection.token, `mutation ($name: String!, $returnUrl: URL!, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems, replacementBehavior: APPLY_IMMEDIATELY) {
      userErrors { field message }
      confirmationUrl
      appSubscription { id status }
    }
  }`, {
    name: `Linkly - ${input.plan.name}`,
    returnUrl,
    test,
    lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: priceUsd, currencyCode: "USD" }, interval } } }]
  });

  const created = (result.data.appSubscriptionCreate || {}) as Json;
  const userErrors = Array.isArray(created.userErrors) ? (created.userErrors as Json[]) : [];
  const appSubscription = (created.appSubscription || {}) as Json;
  const confirmationUrl = typeof created.confirmationUrl === "string" ? created.confirmationUrl : "";
  if (!result.ok || userErrors.length || !confirmationUrl || typeof appSubscription.id !== "string") {
    const reason = String(userErrors[0]?.message || result.errors[0] || "تعذر إنشاء الاشتراك في شوبيفاي");
    await prisma.subscriptionPayment.update({ where: { id: paymentId }, data: { status: PAYMENT_STATUS.failed, failedAt: new Date().toISOString(), failureReason: reason.slice(0, 300) } });
    console.error("[shopify-billing] appSubscriptionCreate failed", { shop: connection.shop, reason });
    return { error: "تعذر بدء الدفع عبر شوبيفاي. حاول مرة أخرى.", status: 502 };
  }

  await prisma.subscriptionPayment.update({ where: { id: paymentId }, data: { gatewayPaymentId: appSubscription.id, paymentUrl: confirmationUrl, gatewayStatus: String(appSubscription.status || "PENDING") } });
  return { confirmationUrl, paymentId };
}

// ---------- Confirmation ----------

type Staged = { priceUsd: number; interval: string; test: boolean };

function stagedTerms(metadataJson: string): Staged | null {
  try {
    const parsed = JSON.parse(metadataJson) as Partial<Staged> & { currency?: string };
    if (parsed.currency !== "USD" || typeof parsed.priceUsd !== "number" || typeof parsed.interval !== "string") return null;
    return { priceUsd: parsed.priceUsd, interval: parsed.interval, test: parsed.test === true };
  } catch {
    return null;
  }
}

/** True when what Shopify reports is exactly what was staged: same price, currency, interval and test flag. */
export function subscriptionMatchesStaged(subscription: ShopifyAppSubscription, staged: Staged): boolean {
  return subscription.currency === "USD"
    && Math.round(subscription.amount * 100) === Math.round(staged.priceUsd * 100)
    && subscription.interval === staged.interval
    && subscription.test === staged.test;
}

export type ConfirmOutcome = "activated" | "already" | "pending" | "declined" | "mismatch" | "unknown";

/**
 * Settles a staged Shopify payment from Shopify's own record (never from the redirect's query string).
 * Safe to call any number of times, from the return route and the webhook alike.
 */
export async function confirmShopifyPayment(paymentId: string): Promise<ConfirmOutcome> {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.gateway !== PAYMENT_GATEWAY.shopify || !payment.gatewayPaymentId) return "unknown";
  if (payment.status === PAYMENT_STATUS.completed) return "already";
  if (payment.status !== PAYMENT_STATUS.pending) return "declined";
  const staged = stagedTerms(payment.metadataJson);
  const connection = await shopConnection(payment.tenantId);
  if (!staged || !connection) return "unknown";

  const subscription = await fetchAppSubscription(connection.shop, connection.token, payment.gatewayPaymentId);
  if (!subscription) return "unknown";
  if (subscription.status === "PENDING") return "pending";
  if (subscription.status !== "ACTIVE") {
    await prisma.subscriptionPayment.updateMany({
      where: { id: payment.id, status: PAYMENT_STATUS.pending },
      data: { status: PAYMENT_STATUS.expired, gatewayStatus: subscription.status, failedAt: new Date().toISOString(), failureReason: `Shopify: ${subscription.status}` }
    });
    return "declined";
  }
  if (!subscriptionMatchesStaged(subscription, staged)) {
    console.error("[shopify-billing] subscription terms differ from the staged payment", { paymentId, subscription, staged });
    const { logAdminAction, getTenantCompanyName } = await import("./subscriptions");
    await logAdminAction(payment.tenantId, await getTenantCompanyName(payment.tenantId), `تعارض في اشتراك شوبيفاي ${subscription.id}: ${subscription.amount} ${subscription.currency} (${subscription.interval}) بينما المتوقع ${staged.priceUsd} USD (${staged.interval}). لم يتم تفعيل أي مزايا - تحقق يدويًا.`, "خطأ");
    return "mismatch";
  }

  const { applyConfirmedSubscriptionPayment } = await import("./subscriptions");
  const applied = await applyConfirmedSubscriptionPayment(payment.id, { gateway: PAYMENT_GATEWAY.shopify, gatewayStatus: "ACTIVE", gatewayPaymentId: subscription.id, paymentMethod: "shopify" });
  if (!applied.activated) return "already";

  // Shopify's own period is the source of truth for when the next charge happens.
  if (subscription.currentPeriodEnd && applied.periodEnd && subscription.currentPeriodEnd > applied.periodEnd) {
    await prisma.subscription.update({ where: { tenantId: payment.tenantId }, data: { renewalAt: subscription.currentPeriodEnd } });
  }
  await updateBillingRow(payment.tenantId, {
    app_subscription_id: subscription.id,
    status: "ACTIVE",
    plan_name: payment.planName,
    billing_cycle: payment.billingCycle,
    price_usd: staged.priceUsd,
    current_period_end: subscription.currentPeriodEnd || applied.periodEnd || ""
  });
  return "activated";
}

/** app_subscriptions/update: settles a pending checkout, or records that the current subscription ended. */
export async function handleAppSubscriptionWebhook(shop: string, body: unknown): Promise<string> {
  const record = ((body && typeof body === "object" ? (body as Json).app_subscription : null) || {}) as Json;
  const id = String(record.admin_graphql_api_id || "");
  const status = String(record.status || "").toUpperCase();
  if (!id) return "no subscription id";

  const pending = await prisma.subscriptionPayment.findFirst({ where: { gateway: PAYMENT_GATEWAY.shopify, gatewayPaymentId: id, status: PAYMENT_STATUS.pending } });
  if (pending) return `checkout ${await confirmShopifyPayment(pending.id)}`;

  await ensureShopifyBillingTables();
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM shopify_billing WHERE shop = ${shop} AND app_subscription_id = ${id} LIMIT 1`;
  const tenantId = rows[0]?.tenant_id;
  if (!tenantId) return "not the current subscription";
  await updateBillingRow(tenantId, { status });
  if (["CANCELLED", "DECLINED", "EXPIRED", "FROZEN"].includes(status)) await markSubscriptionEnding(tenantId);
  return `status ${status}`;
}

/** The plan stays usable until the paid period ends, then lapses like any unpaid subscription. */
async function markSubscriptionEnding(tenantId: string): Promise<void> {
  await prisma.subscription.updateMany({ where: { tenantId, cancelledAt: "" }, data: { cancelledAt: new Date().toISOString() } });
}

/**
 * The owner cancels from Linkly's billing page: the subscription is cancelled in Shopify too (otherwise
 * Shopify would keep charging). Access continues until the paid period ends.
 */
export async function cancelShopifySubscription(tenantId: string): Promise<{ ok: true } | { error: string }> {
  const row = await getShopifyBilling(tenantId);
  if (!row?.app_subscription_id) return { error: "لا يوجد اشتراك شوبيفاي نشط" };
  const connection = await shopConnection(tenantId);
  if (!connection) return { error: "متجر شوبيفاي غير مربوط. ألغِ الاشتراك من صفحة التطبيقات في متجرك." };
  const result = await graphql(connection.shop, connection.token, `mutation ($id: ID!) { appSubscriptionCancel(id: $id) { userErrors { field message } appSubscription { id status } } }`, { id: row.app_subscription_id });
  const cancelled = (result.data.appSubscriptionCancel || {}) as Json;
  const userErrors = Array.isArray(cancelled.userErrors) ? (cancelled.userErrors as Json[]) : [];
  if (!result.ok || userErrors.length) {
    console.error("[shopify-billing] appSubscriptionCancel failed", { tenantId, errors: result.errors, userErrors });
    return { error: "تعذر إلغاء الاشتراك في شوبيفاي. حاول مرة أخرى." };
  }
  await updateBillingRow(tenantId, { status: "CANCELLED" });
  await markSubscriptionEnding(tenantId);
  return { ok: true };
}

/** The app was uninstalled: Shopify cancels its charges, so the subscription stops renewing. */
export async function handleShopifyUninstallBilling(tenantId: string): Promise<void> {
  const row = await getShopifyBilling(tenantId);
  if (!row) return;
  await updateBillingRow(tenantId, { status: "CANCELLED" });
  if (row.app_subscription_id) await markSubscriptionEnding(tenantId);
}

/**
 * Pending Shopify checkouts whose return and webhook both went missing: asked again from Shopify after a
 * few minutes; one Shopify never approved within a day is expired.
 */
export async function settleStaleShopifyCheckouts(limit = 25): Promise<{ settled: number; expired: number }> {
  const quietFor = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const giveUp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const pending = await prisma.subscriptionPayment.findMany({
    where: { gateway: PAYMENT_GATEWAY.shopify, status: PAYMENT_STATUS.pending, createdAt: { lt: quietFor } },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  let settled = 0;
  let expired = 0;
  for (const payment of pending) {
    const outcome = await confirmShopifyPayment(payment.id);
    if (outcome === "activated") settled += 1;
    else if ((outcome === "pending" || outcome === "unknown") && payment.createdAt < giveUp) {
      await prisma.subscriptionPayment.updateMany({
        where: { id: payment.id, status: PAYMENT_STATUS.pending },
        data: { status: PAYMENT_STATUS.expired, failedAt: new Date().toISOString(), failureReason: "لم تتم الموافقة في شوبيفاي خلال المهلة" }
      });
      expired += 1;
    }
  }
  return { settled, expired };
}

// ---------- Renewals ----------

/**
 * Records each period Shopify has charged since we last looked. Runs from the cron: for every active
 * Shopify-billed workspace whose paid-through date has passed, reads the subscription; when Shopify's
 * currentPeriodEnd moved past our renewal date, a completed payment is recorded for the new period
 * (crediting the plan's message allowance, like any renewal). The payment id is derived from the
 * subscription and period, so a re-run never records the same period twice.
 */
export async function syncShopifyRenewals(limit = 50): Promise<{ renewed: number; ended: number }> {
  await ensureShopifyBillingTables();
  const due = await prisma.$queryRaw<ShopifyBillingRow[]>`SELECT tenant_id, shop, app_subscription_id, status, plan_name, billing_cycle, price_usd, current_period_end FROM shopify_billing WHERE status = 'ACTIVE' AND app_subscription_id <> '' AND current_period_end <> '' AND current_period_end <= ${new Date().toISOString()} LIMIT ${limit}`;
  let renewed = 0;
  let ended = 0;
  for (const row of due) {
    const connection = await shopConnection(row.tenant_id);
    if (!connection) continue;
    const subscription = await fetchAppSubscription(connection.shop, connection.token, row.app_subscription_id);
    if (!subscription) continue;
    if (subscription.status !== "ACTIVE") {
      await updateBillingRow(row.tenant_id, { status: subscription.status });
      await markSubscriptionEnding(row.tenant_id);
      ended += 1;
      continue;
    }
    if (!subscription.currentPeriodEnd || subscription.currentPeriodEnd <= row.current_period_end) continue;

    const periodKey = subscription.currentPeriodEnd.slice(0, 10);
    const paymentId = `shopify-${subscription.id.split("/").pop()}-${periodKey}`;
    const exists = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!exists) {
      const plan = await prisma.plan.findUnique({ where: { name: row.plan_name } });
      const sarEquivalent = Math.round(Number(row.price_usd) * SAR_PER_USD * 100) / 100;
      await prisma.subscriptionPayment.create({
        data: {
          id: paymentId,
          tenantId: row.tenant_id,
          amount: sarEquivalent,
          amountHalalas: Math.round(sarEquivalent * 100),
          status: PAYMENT_STATUS.pending,
          createdAt: new Date().toISOString(),
          planName: row.plan_name,
          planEmployeeLimit: plan?.employeeLimit ?? 0,
          planMessageQuota: plan?.messageQuota ?? 0,
          billingCycle: row.billing_cycle || "شهري",
          listPrice: sarEquivalent,
          gateway: PAYMENT_GATEWAY.shopify,
          gatewayPaymentId: subscription.id,
          initiatedBy: "shopify-renewal",
          metadataJson: JSON.stringify({ currency: "USD", priceUsd: Number(row.price_usd), interval: subscription.interval, shop: connection.shop, test: subscription.test, renewal: true, sarPerUsd: SAR_PER_USD })
        }
      });
      const { applyConfirmedSubscriptionPayment } = await import("./subscriptions");
      await applyConfirmedSubscriptionPayment(paymentId, { gateway: PAYMENT_GATEWAY.shopify, gatewayStatus: "ACTIVE", gatewayPaymentId: subscription.id, paymentMethod: "shopify" });
      await prisma.subscription.update({ where: { tenantId: row.tenant_id }, data: { renewalAt: subscription.currentPeriodEnd } });
      renewed += 1;
    }
    await updateBillingRow(row.tenant_id, { current_period_end: subscription.currentPeriodEnd });
  }
  return { renewed, ended };
}
