import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-salla-billing.db");
vi.setConfig({ testTimeout: 120_000 });

const owner = { email: "owner@salla-install.test", name: "Huda Owner", merchantName: "متجر الهدى" };
let userInfoEmail = owner.email;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    if (String(url).includes("oauth2/user/info")) return json({ data: { name: owner.name, email: userInfoEmail, merchant: { id: 5001, name: owner.merchantName } } });
    return json({});
  }));
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

async function send(event: string, data: Record<string, unknown>, merchant = 5001) {
  const { handleSallaWebhook } = await import("../lib/store-engine");
  return handleSallaWebhook({ event, merchant, data });
}

const authorize = { access_token: "tok-a", refresh_token: "tok-r", expires: Math.floor(Date.now() / 1000) + 3600, scope: "orders.read" };

async function subscriptionOf(merchantId: string) {
  const { findTenantByMerchant } = await import("../lib/store-connections");
  const tenantId = (await findTenantByMerchant("salla", merchantId, { includeDisconnected: true }))!;
  const { prisma } = await import("../lib/prisma");
  return { tenantId, subscription: await prisma.subscription.findUniqueOrThrow({ where: { tenantId } }) };
}

describe("Salla plan names", () => {
  it("maps the listing's Arabic and English names to Linkly's plans", async () => {
    const { mapSallaPlanName, sallaBillingCycle } = await import("../lib/salla-billing");
    expect(mapSallaPlanName("الأفراد")).toBe("باقة الأفراد");
    expect(mapSallaPlanName("الأفراد (سنوي)")).toBe("باقة الأفراد");
    expect(mapSallaPlanName("العادية")).toBe("الباقة العادية");
    expect(mapSallaPlanName("المؤسسات الصغيرة")).toBe("باقة المؤسسات الصغيرة");
    expect(mapSallaPlanName("المؤسسات الكبيرة")).toBe("باقة المؤسسات الكبيرة");
    expect(mapSallaPlanName("Small Business")).toBe("باقة المؤسسات الصغيرة");
    expect(mapSallaPlanName("Large")).toBe("باقة المؤسسات الكبيرة");
    expect(mapSallaPlanName("شيء آخر")).toBeNull();
    expect(sallaBillingCycle("2026-01-01", "2026-01-31")).toBe("شهري");
    expect(sallaBillingCycle("2026-01-01", "2027-01-01")).toBe("سنوي");
  });
});

describe("Installing from Salla and being billed by Salla", () => {
  it("creates a workspace on install, then follows Salla's trial, subscription, renewal, cancel and expiry", async () => {
    const installed = await send("app.store.authorize", authorize);
    expect(installed).toMatchObject({ handled: true, status: 200, detail: "created" });

    const first = await subscriptionOf("5001");
    const tenantId = first.tenantId;
    let subscription = first.subscription;
    expect(subscription.status).toBe("تجربة");
    expect(subscription.ownerEmail).toBe(owner.email);
    const { isSallaBilled } = await import("../lib/salla-billing");
    expect(await isSallaBilled(tenantId)).toBe(true);

    // Salla delivers the install a second time (retry): no second workspace.
    expect((await send("app.store.authorize", authorize)).detail).toBe("reinstalled");

    const end = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await send("app.trial.started", { plan_name: "العادية", start_date: "2026-01-01", end_date: end });
    ({ subscription } = await subscriptionOf("5001"));
    expect(subscription.plan).toBe("الباقة العادية");
    expect(subscription.status).toBe("تجربة");

    const monthEnd = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const paid = { subscription_id: "sub-1", plan_name: "العادية", start_date: new Date().toISOString().slice(0, 10), end_date: monthEnd, total: 349, item_type: "plan" };
    await send("app.subscription.started", paid);
    ({ subscription } = await subscriptionOf("5001"));
    expect(subscription.status).toBe("نشط");
    expect(subscription.plan).toBe("الباقة العادية");
    expect(subscription.billingCycle).toBe("شهري");
    expect(subscription.renewalAt.slice(0, 10)).toBe(monthEnd);

    // The same delivery again must not record a second payment.
    await send("app.subscription.started", paid);
    const { prisma } = await import("../lib/prisma");
    expect(await prisma.subscriptionPayment.count({ where: { tenantId, gateway: "salla" } })).toBe(1);

    // Renewal moves the paid-through date and records one more period.
    const nextEnd = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    await send("app.subscription.renewed", { ...paid, end_date: nextEnd });
    expect(await prisma.subscriptionPayment.count({ where: { tenantId, gateway: "salla" } })).toBe(2);
    ({ subscription } = await subscriptionOf("5001"));
    expect(subscription.renewalAt.slice(0, 10)).toBe(nextEnd);

    // An upgrade to the yearly large plan applies that plan.
    await send("app.subscription.started", { subscription_id: "sub-2", plan_name: "المؤسسات الكبيرة", start_date: "2026-02-01", end_date: "2027-02-01", total: 8091 });
    ({ subscription } = await subscriptionOf("5001"));
    expect(subscription.plan).toBe("باقة المؤسسات الكبيرة");
    expect(subscription.billingCycle).toBe("سنوي");

    await send("app.subscription.canceled", { subscription_id: "sub-2" });
    ({ subscription } = await subscriptionOf("5001"));
    expect(subscription.status).toBe("نشط");
    expect(subscription.cancelledAt).not.toBe("");

    await send("app.subscription.expired", { subscription_id: "sub-2" });
    ({ subscription } = await subscriptionOf("5001"));
    expect(subscription.status).toBe("متوقف");

    await send("app.uninstalled", {});
    const { getStoreConnection } = await import("../lib/store-connections");
    expect((await getStoreConnection(tenantId, "salla")).status).toBe("disconnected");
  });

  it("holds events that arrive before the install and applies them once the workspace exists", async () => {
    const end = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(await send("app.subscription.started", { subscription_id: "sub-9", plan_name: "المؤسسات الصغيرة", start_date: "2026-03-01", end_date: end, total: 599 }, 7002)).toMatchObject({ status: 200, detail: "queued" });
    userInfoEmail = "second@salla-install.test";
    await send("app.store.authorize", authorize, 7002);
    const { subscription } = await subscriptionOf("7002");
    expect(subscription.plan).toBe("باقة المؤسسات الصغيرة");
    expect(subscription.status).toBe("نشط");
  });

  it("does not attach an existing Linkly account automatically; the owner confirms while signed in", async () => {
    userInfoEmail = owner.email; // already has a workspace from the first test
    const result = await send("app.store.authorize", authorize, 8003);
    expect(result.detail).toBe("existing_account");
    const { findTenantByMerchant } = await import("../lib/store-connections");
    expect(await findTenantByMerchant("salla", "8003", { includeDisconnected: true })).toBeNull();

    const { getSallaPendingLink, claimSallaPendingLink } = await import("../lib/salla-install");
    expect(await getSallaPendingLink(owner.email)).toMatchObject({ merchantId: "8003" });
    const { tenantId } = await subscriptionOf("5001");
    expect(await claimSallaPendingLink(tenantId, owner.email)).toBe(true);
    expect(await findTenantByMerchant("salla", "8003")).toBe(tenantId);
    expect(await getSallaPendingLink(owner.email)).toBeNull();
  });

  it("asks Salla to retry when the owner's email cannot be read", async () => {
    userInfoEmail = "";
    expect(await send("app.store.authorize", authorize, 9004)).toMatchObject({ handled: false, status: 500 });
  });
});
