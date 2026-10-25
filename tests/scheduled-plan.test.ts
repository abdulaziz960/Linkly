import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-scheduled-plan.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_unit");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

async function seedPlans() {
  const { prisma } = await import("../lib/prisma");
  const now = new Date().toISOString();
  for (const [id, name, price] of [["sp-a", "باقة جدولة أ", 100], ["sp-b", "باقة جدولة ب", 300]] as const) {
    await prisma.plan.upsert({ where: { id }, update: {}, create: { id, name, monthlyPrice: price, employeeLimit: 3, active: 1, createdAt: now, updatedAt: now } });
  }
}

describe("a plan scheduled for the next renewal", () => {
  it("is stored per client, validated, replaced and cleared", async () => {
    await seedPlans();
    const { setScheduledPlan, getScheduledPlan, clearScheduledPlan } = await import("../lib/scheduled-plan");
    expect(await getScheduledPlan("t-x")).toBeNull();
    expect((await setScheduledPlan("t-x", { planName: "باقة غير موجودة", billingCycle: "شهري" }, "Admin")).ok).toBe(false);
    expect((await setScheduledPlan("t-x", { planName: "باقة جدولة أ", billingCycle: "كل يوم" }, "Admin")).ok).toBe(false);
    expect((await setScheduledPlan("t-x", { planName: "باقة جدولة ب", billingCycle: "سنوي" }, "Admin")).ok).toBe(true);
    expect(await getScheduledPlan("t-x")).toMatchObject({ planName: "باقة جدولة ب", billingCycle: "سنوي", setBy: "Admin" });
    await setScheduledPlan("t-x", { planName: "باقة جدولة أ", billingCycle: "شهري" }, "Admin");
    expect(await getScheduledPlan("t-x")).toMatchObject({ planName: "باقة جدولة أ", billingCycle: "شهري" });
    await clearScheduledPlan("t-x");
    expect(await getScheduledPlan("t-x")).toBeNull();
  });

  it("makes the automatic renewal charge the scheduled plan and cycle (with VAT), then clears itself", async () => {
    await seedPlans();
    const { prisma } = await import("../lib/prisma");
    const { attemptAutoRenewals } = await import("../lib/subscriptions");
    const { setScheduledPlan, getScheduledPlan } = await import("../lib/scheduled-plan");
    const tenantId = "tenant-scheduled-autorenew";
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: {
        id: `sub-${tenantId}`, tenantId, companyName: "Sched Co", ownerName: "Owner", ownerEmail: "owner@sched.example",
        plan: "باقة جدولة أ", status: "نشط", employeeLimit: 3, amount: 100, billingCycle: "شهري",
        renewalAt: new Date(Date.now() - 60_000).toISOString(), createdAt: now, updatedAt: now,
        autoRenewEnabled: 1, savedCardToken: "tok_sched", savedCardLast4: "4242", savedCardBrand: "visa", autoRenewFailCount: 0
      }
    });
    await prisma.userAccount.create({ data: { id: `user-${tenantId}`, name: "Owner", email: `owner-${tenantId}@sched.example`, passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now } });
    await setScheduledPlan(tenantId, { planName: "باقة جدولة ب", billingCycle: "سنوي" }, "Admin");

    // 300 x 12 x 0.75 = 2700 without tax; 2700 + 15% = 3105 charged
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "pay_sched", status: "paid", amount: 310500, currency: "SAR", source: { type: "token", token: "tok_sched", company: "visa" } }), { status: 200 })));
    expect(await attemptAutoRenewals("https://app.example")).toEqual({ charged: 1, failed: 0 });

    const payment = await prisma.subscriptionPayment.findFirst({ where: { tenantId, initiatedBy: "system" } });
    expect(payment).toMatchObject({ status: "مكتمل", planName: "باقة جدولة ب", billingCycle: "سنوي", amount: 2700, amountHalalas: 310500 });
    expect((await prisma.subscription.findUnique({ where: { tenantId } }))?.plan).toBe("باقة جدولة ب");
    expect(await getScheduledPlan(tenantId)).toBeNull();
  });
});
