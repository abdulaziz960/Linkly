import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-agreed-price.db");
const tenantId = "tenant-agreed-price";
const user = { id: "user-agreed-price", name: "Owner", email: "owner@agreed-price.example", role: "مالك الحساب", tenantId };

vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_unit");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

afterEach(() => vi.unstubAllGlobals());

async function seed(id: string, extra: Record<string, unknown> = {}) {
  const { prisma } = await import("../lib/prisma");
  const now = new Date().toISOString();
  await prisma.plan.upsert({ where: { id: "plan-agreed" }, update: {}, create: { id: "plan-agreed", name: "باقة السعر الخاص", monthlyPrice: 199, employeeLimit: 3, active: 1, createdAt: now, updatedAt: now } });
  await prisma.plan.upsert({ where: { id: "plan-agreed-other" }, update: {}, create: { id: "plan-agreed-other", name: "باقة أخرى للسعر الخاص", monthlyPrice: 349, employeeLimit: 5, active: 1, createdAt: now, updatedAt: now } });
  await prisma.subscription.create({
    data: { id: `sub-${id}`, tenantId: id, companyName: "شركة السعر الخاص", ownerName: "Owner", ownerEmail: `${id}@example.com`, plan: "باقة السعر الخاص", status: "نشط", employeeLimit: 3, amount: 199, billingCycle: "شهري", renewalAt: "2099-01-01", createdAt: now, updatedAt: now, ...extra }
  });
  return prisma;
}

describe("the price agreed with one client", () => {
  it("applies only to the plan and the cycle it was agreed for", async () => {
    const { agreedPrice, agreedPriceOf, cyclePriceFor } = await import("../lib/billing-pricing");
    const agreed = { price: 149, cycle: "شهري", plan: "باقة السعر الخاص" };
    expect(agreedPrice(agreed, "باقة السعر الخاص", "شهري")).toBe(149);
    expect(agreedPrice(agreed, "باقة السعر الخاص", "سنوي")).toBeNull(); // another cycle: the list price
    expect(agreedPrice(agreed, "باقة أخرى", "شهري")).toBeNull(); // another plan: the list price
    expect(agreedPrice(null, "x", "شهري")).toBeNull();
    expect(agreedPrice({ ...agreed, price: 0 }, "باقة السعر الخاص", "شهري")).toBeNull();
    expect(agreedPriceOf({ customPrice: 0 })).toBeNull();
    const row = { customPrice: 1500, customPriceCycle: "سنوي", customPricePlan: "باقة السعر الخاص" };
    expect(cyclePriceFor(row, { name: "باقة السعر الخاص", monthlyPrice: 199 }, "سنوي")).toBe(1500);
    expect(cyclePriceFor(row, { name: "باقة السعر الخاص", monthlyPrice: 199 }, "شهري")).toBe(199);
    expect(cyclePriceFor(null, { name: "باقة السعر الخاص", monthlyPrice: 199 }, "سنوي")).toBe(1791);
  });

  it("is set, kept and removed by the admin update, and a plan change stops it applying", async () => {
    const prisma = await seed("t-agreed-update");
    const { updateSubscription } = await import("../lib/subscriptions");
    await updateSubscription("t-agreed-update", { billingCycle: "سنوي", amount: 1500, customPrice: 1500 }, "الأدمن");
    expect(await prisma.subscription.findUniqueOrThrow({ where: { tenantId: "t-agreed-update" } })).toMatchObject({ amount: 1500, billingCycle: "سنوي", customPrice: 1500, customPriceCycle: "سنوي", customPricePlan: "باقة السعر الخاص" });
    expect(await prisma.adminLog.count({ where: { clientId: "t-agreed-update", message: { contains: "سعر خاص 1,500" } } })).toBe(1);

    // An edit that does not mention it leaves it alone.
    await updateSubscription("t-agreed-update", { renewalAt: "2099-06-01" }, "الأدمن");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId: "t-agreed-update" } })).customPrice).toBe(1500);

    // Moving the client to another plan: the stored price still names the old plan, so it no longer applies.
    await updateSubscription("t-agreed-update", { plan: "باقة أخرى للسعر الخاص" }, "الأدمن");
    const { cyclePriceFor } = await import("../lib/billing-pricing");
    const moved = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: "t-agreed-update" } });
    expect(cyclePriceFor(moved, { name: "باقة أخرى للسعر الخاص", monthlyPrice: 349 }, "سنوي")).toBe(3141); // the list price (349 x 12, 25% off)

    await updateSubscription("t-agreed-update", { customPrice: 0 }, "الأدمن");
    expect(await prisma.subscription.findUniqueOrThrow({ where: { tenantId: "t-agreed-update" } })).toMatchObject({ customPrice: 0, customPriceCycle: "", customPricePlan: "" });
  });

  it("is what the client's own checkout charges, for their plan and cycle only", async () => {
    const prisma = await seed(tenantId, { customPrice: 149, customPriceCycle: "شهري", customPricePlan: "باقة السعر الخاص", renewalAt: "2020-01-01" });
    const { POST } = await import("../app/api/billing/checkout/route");
    const checkout = async (planId: string, billingCycle: string) => {
      const response = await POST(new NextRequest("http://localhost/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, billingCycle }) }));
      expect(response.status).toBe(200);
      return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: ((await response.json()) as { paymentId: string }).paymentId } });
    };
    const monthly = await checkout("plan-agreed", "شهري");
    expect(monthly).toMatchObject({ amount: 149, amountHalalas: 17135, listPrice: 149 }); // 149 + 15% tax
    const yearly = await checkout("plan-agreed", "سنوي");
    expect(yearly.amount).toBe(1791); // another cycle: the list price
    const otherPlan = await checkout("plan-agreed-other", "شهري");
    expect(otherPlan.amount).toBe(349); // another plan: the list price
  });

  it("is what the saved card is charged at renewal", async () => {
    const prisma = await seed("t-agreed-renew", { customPrice: 149, customPriceCycle: "شهري", customPricePlan: "باقة السعر الخاص", renewalAt: new Date(Date.now() - 60_000).toISOString(), autoRenewEnabled: 1, savedCardToken: "tok_test_agreed", savedCardLast4: "4242", savedCardBrand: "visa", autoRenewFailCount: 0 });
    await prisma.userAccount.create({ data: { id: "user-t-agreed-renew", name: "Owner", email: "owner-agreed-renew@example.com", passwordHash: "x", role: "مالك الحساب", tenantId: "t-agreed-renew", createdAt: new Date().toISOString() } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "pay_agreed", status: "paid", amount: 17135, currency: "SAR", source: { type: "token", token: "tok_test_agreed", company: "visa" } }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const { attemptAutoRenewals } = await import("../lib/subscriptions");
    expect(await attemptAutoRenewals("https://app.example")).toMatchObject({ charged: 1, failed: 0 });
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({ where: { tenantId: "t-agreed-renew", initiatedBy: "system" } });
    expect(payment).toMatchObject({ status: "مكتمل", amount: 149, amountHalalas: 17135 });
  });
});
