import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-manual-payment.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function setup(tenantId: string, subscription: { status?: string; amount?: number; billingCycle?: string; renewalAt?: string } = {}) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.plan.upsert({ where: { name: "باقة اختبار الدفع اليدوي" }, update: {}, create: { id: "plan-manual", name: "باقة اختبار الدفع اليدوي", monthlyPrice: 199, employeeLimit: 3, messageQuota: 500, active: 1, createdAt: now, updatedAt: now } });
  await prisma.subscription.create({
    data: {
      id: `sub-${tenantId}`, tenantId, companyName: `شركة ${tenantId}`, ownerName: "مالك", ownerEmail: `${tenantId}@example.com`, plan: "باقة اختبار الدفع اليدوي",
      status: subscription.status ?? "نشط", employeeLimit: 3, amount: subscription.amount ?? 199, billingCycle: subscription.billingCycle ?? "شهري",
      renewalAt: subscription.renewalAt ?? "2026-12-02", createdAt: now, updatedAt: now
    }
  });
  return prisma;
}

describe("a payment confirmed by hand (bank transfer)", () => {
  it("renews the subscription from its current end date and records a completed payment with tax included", async () => {
    const prisma = await setup("t-renew", { renewalAt: "2099-01-10" });
    const { recordManualSubscriptionPayment } = await import("../lib/manual-payment");
    const result = await recordManualSubscriptionPayment({ tenantId: "t-renew", amount: 199, billingCycle: "شهري", method: "تحويل بنكي", reference: "TR-1001", adminName: "الأدمن" });
    if (!result.ok) throw new Error(result.error);
    expect(result.netSar).toBe(199);
    expect(result.totalSar).toBe(228.85); // 199 + 15% tax, as for any new customer
    expect(result.renewalAt).toBe("2099-02-10"); // one month after the date it was paid through: no paid days lost

    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });
    expect(payment).toMatchObject({ status: "مكتمل", gateway: "manual", paymentMethod: "تحويل بنكي", gatewayStatus: "paid", initiatedBy: "admin", amount: 228.85, amountHalalas: 22885, billingCycle: "شهري" });
    expect(JSON.parse(payment.metadataJson)).toMatchObject({ kind: "manual", reference: "TR-1001", by: "الأدمن" });

    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: "t-renew" } });
    expect(subscription).toMatchObject({ status: "نشط", amount: 199, billingCycle: "شهري", renewalAt: "2099-02-10" });

    // It joins the payments list and the collected totals.
    const { getSubscriptionPayments } = await import("../lib/subscriptions");
    const listed = (await getSubscriptionPayments()).find((row) => row.id === result.paymentId);
    expect(listed).toMatchObject({ status: "مكتمل", amount: 228.85 });
    expect(await prisma.adminLog.count({ where: { clientId: "t-renew", message: { contains: "TR-1001" } } })).toBe(1);
  });

  it("activates a stopped subscription for a year at an agreed price, and an agreed end date wins", async () => {
    const prisma = await setup("t-annual", { status: "متوقف", amount: 199, billingCycle: "شهري", renewalAt: "2020-01-01" });
    const { recordManualSubscriptionPayment } = await import("../lib/manual-payment");
    const result = await recordManualSubscriptionPayment({ tenantId: "t-annual", amount: 1791, billingCycle: "سنوي", method: "نقدًا", renewalAt: "2027-12-15", adminName: "الأدمن" });
    if (!result.ok) throw new Error(result.error);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: "t-annual" } });
    expect(subscription).toMatchObject({ status: "نشط", amount: 1791, billingCycle: "سنوي", renewalAt: "2027-12-15" });
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: result.paymentId } });
    expect(payment).toMatchObject({ paymentMethod: "نقدًا", periodEnd: "2027-12-15", billingCycle: "سنوي" });
  });

  it("refuses a missing client, a bad price and a bad date, and records nothing", async () => {
    const prisma = await setup("t-bad");
    const { recordManualSubscriptionPayment } = await import("../lib/manual-payment");
    expect(await recordManualSubscriptionPayment({ tenantId: "nobody", amount: 100, adminName: "x" })).toMatchObject({ ok: false, status: 404 });
    for (const amount of [0, -5, "abc", 6_000_000]) expect(await recordManualSubscriptionPayment({ tenantId: "t-bad", amount, adminName: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await recordManualSubscriptionPayment({ tenantId: "t-bad", amount: 100, renewalAt: "not-a-date", adminName: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await prisma.subscriptionPayment.count({ where: { tenantId: "t-bad" } })).toBe(0);
  });
});
