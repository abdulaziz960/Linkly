import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-shopify-billing.db");
const shop = "billing-store.myshopify.com";
const tenantId = "tenant-shopify-billing";

vi.setConfig({ testTimeout: 120_000 });

// ---------- a small fake Shopify: GraphQL billing + shop.json + OAuth + webhooks ----------
type FakeSubscription = { id: string; status: string; test: boolean; amount: number; currency: string; interval: string; currentPeriodEnd: string };
const fake = {
  subscriptions: new Map<string, FakeSubscription>(),
  nextId: 1,
  partnerDevelopment: true,
  createError: "",
  cancelled: [] as string[],
  shopEmail: "owner@billing-store.test",
  graphqlCalls: [] as Array<{ query: string; variables: Record<string, unknown> }>
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function subscriptionNode(sub: FakeSubscription) {
  return { id: sub.id, status: sub.status, test: sub.test, currentPeriodEnd: sub.currentPeriodEnd, lineItems: [{ plan: { pricingDetails: { __typename: "AppRecurringPricing", interval: sub.interval, price: { amount: String(sub.amount), currencyCode: sub.currency } } } }] };
}

async function fakeShopify(url: string, init?: RequestInit): Promise<Response> {
  if (url.endsWith("/graphql.json")) {
    const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    fake.graphqlCalls.push({ query, variables });
    if (query.includes("partnerDevelopment")) return json({ data: { shop: { plan: { partnerDevelopment: fake.partnerDevelopment } } } });
    if (query.includes("appSubscriptionCreate")) {
      if (fake.createError) return json({ data: { appSubscriptionCreate: { userErrors: [{ field: ["price"], message: fake.createError }], confirmationUrl: null, appSubscription: null } } });
      const item = (variables.lineItems as Array<{ plan: { appRecurringPricingDetails: { price: { amount: number; currencyCode: string }; interval: string } } }>)[0].plan.appRecurringPricingDetails;
      const id = `gid://shopify/AppSubscription/${fake.nextId++}`;
      fake.subscriptions.set(id, { id, status: "PENDING", test: variables.test === true, amount: item.price.amount, currency: item.price.currencyCode, interval: item.interval, currentPeriodEnd: "" });
      return json({ data: { appSubscriptionCreate: { userErrors: [], confirmationUrl: `https://${shop}/admin/charges/confirm?id=${id}`, appSubscription: { id, status: "PENDING" } } } });
    }
    if (query.includes("appSubscriptionCancel")) {
      const sub = fake.subscriptions.get(String(variables.id));
      if (sub) sub.status = "CANCELLED";
      fake.cancelled.push(String(variables.id));
      return json({ data: { appSubscriptionCancel: { userErrors: [], appSubscription: { id: variables.id, status: "CANCELLED" } } } });
    }
    if (query.includes("node(id:")) {
      const sub = fake.subscriptions.get(String(variables.id));
      return json({ data: { node: sub ? subscriptionNode(sub) : null } });
    }
    return json({ errors: [{ message: "unexpected query" }] });
  }
  if (url.includes("/oauth/access_token")) return json({ access_token: "shpat_installed", scope: "read_orders,read_customers" });
  if (url.includes("/shop.json")) return json({ shop: { name: "Billing Store", myshopify_domain: shop, email: fake.shopEmail, shop_owner: "Sara Owner" } });
  if (url.includes("/webhooks.json")) return json({ webhook: { id: 1 } });
  return json({});
}

/** The merchant pressed "Approve" on Shopify's page. */
function approve(id: string, periodEnd: string) {
  const sub = fake.subscriptions.get(id)!;
  sub.status = "ACTIVE";
  sub.currentPeriodEnd = periodEnd;
}

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
  vi.stubEnv("SHOPIFY_CLIENT_ID", "client-billing");
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", "secret-billing");
  vi.stubGlobal("fetch", vi.fn((url: string | URL, init?: RequestInit) => fakeShopify(String(url), init)));
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.unstubAllGlobals();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

beforeEach(() => {
  fake.createError = "";
  fake.partnerDevelopment = true;
});

async function setup() {
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const { prisma } = await import("../lib/prisma");
  const now = new Date().toISOString();
  await prisma.subscription.upsert({
    where: { tenantId },
    update: {},
    create: { id: `sub-${tenantId}`, tenantId, companyName: "Billing Store", ownerName: "Sara", ownerEmail: "sara@billing.test", plan: "باقة المؤسسات الكبيرة", status: "تجربة", employeeLimit: 8, amount: 0, billingCycle: "تجربة 3 أيام", renewalAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), createdAt: now, updatedAt: now }
  });
  const { saveShopifyConnection } = await import("../lib/shopify");
  await saveShopifyConnection(tenantId, shop, "shpat_billing", "Billing Store");
  const { markShopifyBilled, setShopifyPlanPrice } = await import("../lib/shopify-billing");
  await markShopifyBilled(tenantId, shop);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { name: "باقة المؤسسات الكبيرة" } });
  await setShopifyPlanPrice(plan.id, 49);
  return plan;
}

async function checkout(billingCycle: "شهري" | "سنوي" = "شهري") {
  const plan = await setup();
  const { startShopifyCheckout } = await import("../lib/shopify-billing");
  return { plan, result: await startShopifyCheckout({ tenantId, userId: "user-1", plan, billingCycle, returnOrigin: "https://linklysa.io" }) };
}

describe("Shopify prices", () => {
  it("charges the monthly USD price, or 12 months with the yearly discount", async () => {
    const { shopifyPriceForCycle, formatUsd } = await import("../lib/shopify-pricing");
    expect(shopifyPriceForCycle(49, "شهري")).toBe(49);
    expect(shopifyPriceForCycle(49, "سنوي")).toBe(441); // 49 x 12 x 0.75
    expect(shopifyPriceForCycle(19.99, "سنوي")).toBe(179.91);
    expect(formatUsd(441)).toBe("$441");
    expect(formatUsd(36.75)).toBe("$36.75");
  });
});

describe("Shopify checkout and confirmation", () => {
  it("stages the payment and asks Shopify for a test subscription on a development store", async () => {
    const { result } = await checkout();
    if ("error" in result) throw new Error(result.error);
    expect(result.confirmationUrl).toContain("/admin/charges/confirm");

    const { prisma } = await import("../lib/prisma");
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });
    expect(payment).toMatchObject({ status: "قيد الانتظار", gateway: "shopify", planName: "باقة المؤسسات الكبيرة", billingCycle: "شهري" });
    expect(payment.gatewayPaymentId).toMatch(/^gid:\/\/shopify\/AppSubscription\//);
    expect(JSON.parse(payment.metadataJson)).toMatchObject({ currency: "USD", priceUsd: 49, interval: "EVERY_30_DAYS", test: true });
    const create = fake.graphqlCalls.find((call) => call.query.includes("appSubscriptionCreate"))!;
    expect(create.variables).toMatchObject({ test: true, returnUrl: `https://linklysa.io/api/billing/shopify/return?payment=${result.paymentId}` });

    // Nothing is applied before Shopify reports the charge.
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).status).toBe("تجربة");
  });

  it("activates the plan only once Shopify reports it ACTIVE, and only once", async () => {
    const { result } = await checkout("سنوي");
    if ("error" in result) throw new Error(result.error);
    const { confirmShopifyPayment, getShopifyBilling } = await import("../lib/shopify-billing");
    const { prisma } = await import("../lib/prisma");
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });

    expect(await confirmShopifyPayment(result.paymentId)).toBe("pending");
    const periodEnd = new Date(Date.now() + 365 * 86_400_000).toISOString();
    approve(payment.gatewayPaymentId, periodEnd);
    expect(await confirmShopifyPayment(result.paymentId)).toBe("activated");
    expect(await confirmShopifyPayment(result.paymentId)).toBe("already");

    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } });
    expect(subscription).toMatchObject({ status: "نشط", plan: "باقة المؤسسات الكبيرة", billingCycle: "سنوي" });
    expect(subscription.renewalAt >= periodEnd.slice(0, 10)).toBe(true);
    expect(await getShopifyBilling(tenantId)).toMatchObject({ status: "ACTIVE", app_subscription_id: payment.gatewayPaymentId, price_usd: 441 });
    expect(JSON.parse(payment.metadataJson).interval).toBe("ANNUAL");
  });

  it("does not activate a subscription whose price differs from the staged one", async () => {
    const { result } = await checkout();
    if ("error" in result) throw new Error(result.error);
    const { prisma } = await import("../lib/prisma");
    const before = await prisma.subscriptionPayment.count({ where: { tenantId, status: "مكتمل" } });
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });
    approve(payment.gatewayPaymentId, new Date(Date.now() + 30 * 86_400_000).toISOString());
    fake.subscriptions.get(payment.gatewayPaymentId)!.amount = 1;
    const { confirmShopifyPayment } = await import("../lib/shopify-billing");
    expect(await confirmShopifyPayment(result.paymentId)).toBe("mismatch");
    expect(await prisma.subscriptionPayment.count({ where: { tenantId, status: "مكتمل" } })).toBe(before);
  });

  it("expires the staged payment when the merchant declines", async () => {
    const { result } = await checkout();
    if ("error" in result) throw new Error(result.error);
    const { prisma } = await import("../lib/prisma");
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });
    fake.subscriptions.get(payment.gatewayPaymentId)!.status = "DECLINED";
    const { confirmShopifyPayment } = await import("../lib/shopify-billing");
    expect(await confirmShopifyPayment(result.paymentId)).toBe("declined");
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } })).status).toBe("منتهي الصلاحية");
  });

  it("settles a checkout from the app_subscriptions/update webhook when the return never came", async () => {
    const { result } = await checkout();
    if ("error" in result) throw new Error(result.error);
    const { prisma } = await import("../lib/prisma");
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });
    approve(payment.gatewayPaymentId, new Date(Date.now() + 30 * 86_400_000).toISOString());
    const { handleShopifyWebhook } = await import("../lib/store-engine");
    const outcome = await handleShopifyWebhook("app_subscriptions/update", shop, { app_subscription: { admin_graphql_api_id: payment.gatewayPaymentId, status: "ACTIVE" } });
    expect(outcome.detail).toBe("checkout activated");
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } })).status).toBe("مكتمل");
  });

  it("refuses a plan without a USD price, and reports Shopify's own refusal", async () => {
    const plan = await setup();
    const { startShopifyCheckout, setShopifyPlanPrice } = await import("../lib/shopify-billing");
    await setShopifyPlanPrice(plan.id, 0);
    expect(await startShopifyCheckout({ tenantId, userId: "u", plan, billingCycle: "شهري", returnOrigin: "https://linklysa.io" })).toMatchObject({ status: 400 });
    await setShopifyPlanPrice(plan.id, 49);
    fake.createError = "Price must be positive";
    const failed = await startShopifyCheckout({ tenantId, userId: "u", plan, billingCycle: "شهري", returnOrigin: "https://linklysa.io" });
    expect(failed).toMatchObject({ status: 502 });
  });

  it("the return route trusts only Shopify's record, not the query string", async () => {
    const { GET } = await import("../app/api/billing/shopify/return/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("https://linklysa.io/api/billing/shopify/return?payment=does-not-exist&charge_id=123"));
    expect(response.headers.get("location")).toBe("https://linklysa.io/billing?shopify=failed");
  });
});

describe("Shopify renewals and cancellation", () => {
  it("records each new period Shopify charged, once", async () => {
    const { result } = await checkout();
    if ("error" in result) throw new Error(result.error);
    const { prisma } = await import("../lib/prisma");
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });
    const { confirmShopifyPayment, syncShopifyRenewals, getShopifyBilling } = await import("../lib/shopify-billing");
    approve(payment.gatewayPaymentId, new Date(Date.now() + 30 * 86_400_000).toISOString());
    expect(await confirmShopifyPayment(result.paymentId)).toBe("activated");

    // Our record says the period ended; Shopify has already charged the next one.
    await prisma.$executeRawUnsafe(`UPDATE shopify_billing SET current_period_end = '${new Date(Date.now() - 60_000).toISOString()}' WHERE tenant_id = '${tenantId}'`);
    const nextEnd = new Date(Date.now() + 60 * 86_400_000).toISOString();
    fake.subscriptions.get(payment.gatewayPaymentId)!.currentPeriodEnd = nextEnd;
    const completedBefore = await prisma.subscriptionPayment.count({ where: { tenantId, status: "مكتمل" } });

    expect(await syncShopifyRenewals()).toMatchObject({ renewed: 1 });
    expect(await syncShopifyRenewals()).toMatchObject({ renewed: 0 });
    expect(await prisma.subscriptionPayment.count({ where: { tenantId, status: "مكتمل" } })).toBe(completedBefore + 1);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).renewalAt).toBe(nextEnd);
    expect((await getShopifyBilling(tenantId))?.current_period_end).toBe(nextEnd);
  });

  it("cancelling from Linkly cancels in Shopify too, and the plan runs to the end of the period", async () => {
    const { cancelShopifySubscription, getShopifyBilling } = await import("../lib/shopify-billing");
    const current = (await getShopifyBilling(tenantId))!.app_subscription_id;
    expect(await cancelShopifySubscription(tenantId)).toEqual({ ok: true });
    expect(fake.cancelled).toContain(current);
    const { prisma } = await import("../lib/prisma");
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } });
    expect(subscription.cancelledAt).not.toBe("");
    expect(subscription.status).toBe("نشط");
    expect((await getShopifyBilling(tenantId))?.status).toBe("CANCELLED");
  });

  it("a workspace that is not Shopify-billed is untouched", async () => {
    const { isShopifyBilled } = await import("../lib/shopify-billing");
    expect(await isShopifyBilled("tenant-pays-with-moyasar")).toBe(false);
  });
});

describe("installing from Shopify with nobody signed in", () => {
  it("opens a workspace on a 3-day trial of the store plan, Shopify-billed, with the store connected", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    fake.shopEmail = "new-merchant@billing-store.test";
    const installShop = "fresh-store.myshopify.com";
    const { installFromShopify } = await import("../lib/shopify-install");
    expect(await installFromShopify(installShop, "code-1", "https://linklysa.io")).toBe("created");

    const { prisma } = await import("../lib/prisma");
    const account = await prisma.userAccount.findUniqueOrThrow({ where: { email: "new-merchant@billing-store.test" } });
    expect(account.role).toBe("مالك الحساب");
    expect(account.passwordHash).toBe("");
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: account.tenantId } });
    expect(subscription).toMatchObject({ status: "تجربة", plan: "باقة المؤسسات الكبيرة" });
    const trialDays = (new Date(subscription.renewalAt).getTime() - Date.now()) / 86_400_000;
    expect(trialDays).toBeGreaterThan(2.9);
    expect(trialDays).toBeLessThan(3.1);
    const { isShopifyBilled } = await import("../lib/shopify-billing");
    expect(await isShopifyBilled(account.tenantId)).toBe(true);
    const { findTenantByMerchant } = await import("../lib/store-connections");
    expect(await findTenantByMerchant("shopify", installShop)).toBe(account.tenantId);

    // Installing again from the same shop reconnects that workspace instead of opening another.
    expect(await installFromShopify(installShop, "code-2", "https://linklysa.io")).toBe("reinstalled");
    expect(await prisma.userAccount.count({ where: { email: "new-merchant@billing-store.test" } })).toBe(1);
  });

  it("never attaches a shop to an existing Linkly account by email", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.userAccount.create({ data: { id: "user-existing", name: "Existing", email: "taken@billing-store.test", passwordHash: "scrypt$x$y", role: "مالك الحساب", tenantId: "tenant-existing", createdAt: new Date().toISOString() } });
    fake.shopEmail = "taken@billing-store.test";
    const { installFromShopify } = await import("../lib/shopify-install");
    expect(await installFromShopify("other-store.myshopify.com", "code-3", "https://linklysa.io")).toBe("existing_account");
    const { findTenantByMerchant } = await import("../lib/store-connections");
    expect(await findTenantByMerchant("shopify", "other-store.myshopify.com", { includeDisconnected: true })).toBeNull();
  });
});
