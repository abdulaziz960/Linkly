import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-billing-cycle.db");
const tenantId = "tenant-billing-cycle";

const user = { id: "user-billing-cycle", name: "Owner", email: "owner@billing-cycle.example", role: "مالك الحساب", tenantId };

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => user)
}));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("billing-pricing helpers", () => {
  it("discounts the annual price 20% off 12x the monthly price", async () => {
    const { computeYearlyPrice, priceForCycle } = await import("../lib/billing-pricing");
    expect(computeYearlyPrice(199)).toBe(1910); // 199*12=2388, *0.8=1910.4 -> 1910
    expect(computeYearlyPrice(279)).toBe(2678); // 279*12=3348, *0.8=2678.4 -> 2678
    expect(priceForCycle(199, "شهري")).toBe(199);
    expect(priceForCycle(199, "سنوي")).toBe(1910);
  });

  it("only recognizes the two known cycle strings", async () => {
    const { isBillingCycle } = await import("../lib/billing-pricing");
    expect(isBillingCycle("شهري")).toBe(true);
    expect(isBillingCycle("سنوي")).toBe(true);
    expect(isBillingCycle("yearly")).toBe(false);
    expect(isBillingCycle(undefined)).toBe(false);
  });
});

describe("subscription period respects the billing cycle", () => {
  it("adds 12 months instead of 1 for an annual period", async () => {
    const { computeSubscriptionPeriod } = await import("../lib/subscriptions");
    const period = computeSubscriptionPeriod({
      now: new Date("2026-09-16T12:00:00Z"),
      currentStatus: "تجربة",
      currentPlan: "باقة الأفراد",
      stagedPlanName: "باقة الأفراد",
      billingCycle: "سنوي"
    });
    expect(period.periodStart).toBe("2026-09-16");
    expect(period.periodEnd).toBe("2027-09-16");
  });
});

describe("proration uses a 365-day denominator for an annual current plan", () => {
  it("credits a yearly-paid current plan's unused days at 1/365 of its price, not 1/30", async () => {
    const { computeProrationCredit } = await import("../lib/subscriptions");
    const now = new Date("2026-09-16T12:00:00Z");
    // 1910 SAR/year plan, 300 days remaining.
    const renewalAt = new Date(now.getTime() + 300 * 86_400_000).toISOString();
    const result = computeProrationCredit({
      now,
      currentStatus: "نشط",
      currentPlan: "باقة الأفراد",
      currentAmount: 1910,
      currentRenewalAt: renewalAt,
      currentBillingCycle: "سنوي",
      newPlanName: "باقة المؤسسات الصغيرة",
      newPlanPrice: 5000
    });
    // 1910 / 365 * 300 = 1569.863... -> rounds to 1569.86
    expect(result.creditAmount).toBe(1569.86);
    expect(result.finalAmount).toBe(3430.14);
  });
});

describe("self-serve checkout with billingCycle=سنوي", () => {
  it("stages a payment at the discounted annual price and records the cycle", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.plan.create({
      data: { id: "plan-billing-cycle-checkout", name: "باقة اختبار الدورة", monthlyPrice: 199, employeeLimit: 3, active: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });

    const { POST } = await import("../app/api/billing/checkout/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "plan-billing-cycle-checkout", billingCycle: "سنوي" })
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as { paymentId?: string };
    expect(payload.paymentId).toBeTruthy();

    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: payload.paymentId! } });
    expect(payment?.billingCycle).toBe("سنوي");
    expect(payment?.amount).toBe(1910); // 199*12*0.8 rounded
    expect(payment?.listPrice).toBe(1910);
  });

  it("keeps a separate pending row per billing cycle instead of reusing the other cycle's stale one", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.plan.upsert({
      where: { id: "plan-billing-cycle-dedup" },
      update: {},
      create: { id: "plan-billing-cycle-dedup", name: "باقة اختبار الدورة 2", monthlyPrice: 100, employeeLimit: 3, active: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });
    const dedupTenant = "tenant-billing-cycle-dedup";
    vi.doMock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ ...user, tenantId: dedupTenant })) }));
    vi.resetModules();

    const { POST } = await import("../app/api/billing/checkout/route");
    const monthly = await POST(new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: "plan-billing-cycle-dedup", billingCycle: "شهري" })
    }));
    const monthlyPayload = await monthly.json() as { paymentId?: string };

    const yearly = await POST(new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: "plan-billing-cycle-dedup", billingCycle: "سنوي" })
    }));
    const yearlyPayload = await yearly.json() as { paymentId?: string };

    expect(monthlyPayload.paymentId).toBeTruthy();
    expect(yearlyPayload.paymentId).toBeTruthy();
    expect(yearlyPayload.paymentId).not.toBe(monthlyPayload.paymentId);

    vi.doUnmock("../lib/auth");
    vi.resetModules();
  });
});

describe("confirming an annual payment activates a 12-month subscription", () => {
  it("sets billingCycle=سنوي and renewalAt a year out", async () => {
    const { prisma } = await import("../lib/prisma");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    const confirmTenant = "tenant-billing-cycle-confirm";
    const paymentId = "sub-pay-billing-cycle-confirm";
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId, tenantId: confirmTenant, amount: 1910, amountHalalas: 191000, status: "قيد الانتظار",
        planName: "باقة اختبار الدورة", planEmployeeLimit: 3, billingCycle: "سنوي", createdAt: new Date().toISOString()
      }
    });

    const { activated, periodEnd } = await applyConfirmedSubscriptionPayment(paymentId, { gateway: "test", gatewayStatus: "paid" });
    expect(activated).toBe(true);
    const expectedEnd = new Date();
    expectedEnd.setUTCFullYear(expectedEnd.getUTCFullYear() + 1);
    expect(periodEnd).toBe(expectedEnd.toISOString().slice(0, 10));

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: confirmTenant } });
    expect(subscription?.billingCycle).toBe("سنوي");
    expect(subscription?.renewalAt).toBe(periodEnd);
  });
});

describe("auto-renewal charges the discounted annual price for a yearly subscriber", () => {
  it("charges 12x-discounted amount and extends renewalAt by a year", async () => {
    const { prisma } = await import("../lib/prisma");
    const { attemptAutoRenewals } = await import("../lib/subscriptions");
    const autorenewTenant = "tenant-billing-cycle-autorenew-yearly";

    await prisma.plan.upsert({
      where: { id: "plan-billing-cycle-autorenew" },
      update: {},
      create: { id: "plan-billing-cycle-autorenew", name: "باقة اختبار التجديد السنوي", monthlyPrice: 199, employeeLimit: 3, active: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: {
        id: `sub-${autorenewTenant}`, tenantId: autorenewTenant, companyName: "Yearly Co", ownerName: "Owner", ownerEmail: "owner@yearly-autorenew.example",
        plan: "باقة اختبار التجديد السنوي", status: "نشط", employeeLimit: 3, amount: 1910, billingCycle: "سنوي",
        renewalAt: new Date(Date.now() - 60_000).toISOString(), createdAt: now, updatedAt: now,
        autoRenewEnabled: 1, savedCardToken: "tok_test_yearly", savedCardLast4: "4242", savedCardBrand: "visa", autoRenewFailCount: 0
      }
    });
    await prisma.userAccount.create({
      data: { id: `user-${autorenewTenant}`, name: "Owner", email: `owner-${autorenewTenant}@yearly-autorenew.example`, passwordHash: "x", role: "مالك الحساب", tenantId: autorenewTenant, createdAt: now }
    });

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ id: "pay_autorenew_yearly", status: "paid", amount: 191000, currency: "SAR", source: { type: "token", token: "tok_test_yearly", company: "visa" } }), { status: 200 })
    ));

    const result = await attemptAutoRenewals("https://app.example");
    expect(result).toEqual({ charged: 1, failed: 0 });

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: autorenewTenant } });
    const renewalYear = new Date(subscription?.renewalAt ?? "").getUTCFullYear();
    expect(renewalYear).toBeGreaterThanOrEqual(new Date().getUTCFullYear() + 1);

    const payment = await prisma.subscriptionPayment.findFirst({ where: { tenantId: autorenewTenant, initiatedBy: "system" } });
    expect(payment).toMatchObject({ status: "مكتمل", amount: 1910, billingCycle: "سنوي" });
  });
});
