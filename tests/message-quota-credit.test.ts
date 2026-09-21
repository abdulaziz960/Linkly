import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-message-quota-credit.db");

const user = { id: "user-message-quota", name: "Owner", email: "owner@message-quota.example", role: "مالك الحساب", tenantId: "tenant-message-quota-checkout" };

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

describe("message-quota helpers", () => {
  it("treats a negative quota as unlimited and formats it for display", async () => {
    const { isUnlimitedMessageQuota, messageQuotaLabel, UNLIMITED_MESSAGE_QUOTA } = await import("../lib/message-quota");
    expect(isUnlimitedMessageQuota(UNLIMITED_MESSAGE_QUOTA)).toBe(true);
    expect(isUnlimitedMessageQuota(0)).toBe(false);
    expect(isUnlimitedMessageQuota(1000)).toBe(false);
    expect(messageQuotaLabel(UNLIMITED_MESSAGE_QUOTA, "ar")).toBe("غير محدود");
    expect(messageQuotaLabel(UNLIMITED_MESSAGE_QUOTA, "en")).toBe("Unlimited");
  });
});

describe("confirming a subscription payment credits the plan's marketing message quota", () => {
  it("credits the monthly quota once for a شهري payment", async () => {
    const { prisma } = await import("../lib/prisma");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    const tenantId = "tenant-message-quota-monthly";
    const paymentId = "sub-pay-message-quota-monthly";
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId, tenantId, amount: 199, amountHalalas: 19900, status: "قيد الانتظار",
        planName: "باقة اختبار الحصة", planEmployeeLimit: 1, planMessageQuota: 1000, billingCycle: "شهري", createdAt: new Date().toISOString()
      }
    });

    const { activated } = await applyConfirmedSubscriptionPayment(paymentId, { gateway: "test", gatewayStatus: "paid" });
    expect(activated).toBe(true);

    const balance = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balance).toMatchObject({ balance: 1000, lastTopUpAmount: 1000 });
  });

  it("credits 12x the monthly quota in one lump sum for a سنوي payment", async () => {
    const { prisma } = await import("../lib/prisma");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    const tenantId = "tenant-message-quota-yearly";
    const paymentId = "sub-pay-message-quota-yearly";
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId, tenantId, amount: 1910, amountHalalas: 191000, status: "قيد الانتظار",
        planName: "باقة اختبار الحصة", planEmployeeLimit: 1, planMessageQuota: 1000, billingCycle: "سنوي", createdAt: new Date().toISOString()
      }
    });

    await applyConfirmedSubscriptionPayment(paymentId, { gateway: "test", gatewayStatus: "paid" });

    const balance = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balance).toMatchObject({ balance: 12000, lastTopUpAmount: 12000 });
  });

  it("credits a large practical constant instead of the unlimited quota itself", async () => {
    const { prisma } = await import("../lib/prisma");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    const { UNLIMITED_MESSAGE_CREDIT, UNLIMITED_MESSAGE_QUOTA } = await import("../lib/message-quota");
    const tenantId = "tenant-message-quota-unlimited";
    const paymentId = "sub-pay-message-quota-unlimited";
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId, tenantId, amount: 1499, amountHalalas: 149900, status: "قيد الانتظار",
        planName: "باقة الشركات الاختبارية", planEmployeeLimit: 100, planMessageQuota: UNLIMITED_MESSAGE_QUOTA, billingCycle: "شهري", createdAt: new Date().toISOString()
      }
    });

    await applyConfirmedSubscriptionPayment(paymentId, { gateway: "test", gatewayStatus: "paid" });

    const balance = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balance?.balance).toBe(UNLIMITED_MESSAGE_CREDIT);
  });

  it("adds to (does not overwrite) an existing balance on renewal", async () => {
    const { prisma } = await import("../lib/prisma");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    const tenantId = "tenant-message-quota-renewal";
    const now = new Date().toISOString();
    await prisma.campaignBalance.create({ data: { tenantId, balance: 400, lastTopUpAmount: 1000, updatedAt: now } });

    const paymentId = "sub-pay-message-quota-renewal";
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId, tenantId, amount: 199, amountHalalas: 19900, status: "قيد الانتظار",
        planName: "باقة اختبار الحصة", planEmployeeLimit: 1, planMessageQuota: 1000, billingCycle: "شهري", createdAt: now
      }
    });

    await applyConfirmedSubscriptionPayment(paymentId, { gateway: "test", gatewayStatus: "paid" });

    const balance = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balance).toMatchObject({ balance: 1400, lastTopUpAmount: 1000 });
  });

  it("does not touch the campaign balance for an admin-issued payment with no staged plan", async () => {
    const { prisma } = await import("../lib/prisma");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    const tenantId = "tenant-message-quota-admin-invoice";
    await prisma.subscription.create({
      data: {
        id: `sub-${tenantId}`, tenantId, companyName: "Admin Invoice Co", ownerName: "Owner", ownerEmail: "owner@admin-invoice.example",
        plan: "باقة قائمة", status: "نشط", employeeLimit: 3, amount: 199, billingCycle: "شهري",
        renewalAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }
    });
    const paymentId = "sub-pay-message-quota-admin-invoice";
    await prisma.subscriptionPayment.create({
      data: { id: paymentId, tenantId, amount: 199, amountHalalas: 19900, status: "قيد الانتظار", createdAt: new Date().toISOString() }
    });

    await applyConfirmedSubscriptionPayment(paymentId, { gateway: "manual", gatewayStatus: "paid" });

    const balance = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balance).toBeNull();
  });
});

describe("checkout stages the chosen plan's message quota on the payment row", () => {
  it("captures Plan.messageQuota onto SubscriptionPayment.planMessageQuota at checkout time", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.plan.create({
      data: {
        id: "plan-message-quota-checkout", name: "باقة اختبار قاعدة البيانات", monthlyPrice: 279, employeeLimit: 3, active: 1,
        messageQuota: 3000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }
    });

    const { POST } = await import("../app/api/billing/checkout/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: "plan-message-quota-checkout", billingCycle: "شهري" })
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as { paymentId?: string };

    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: payload.paymentId! } });
    expect(payment?.planMessageQuota).toBe(3000);
  });
});
