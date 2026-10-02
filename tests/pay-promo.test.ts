import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-pay-promo.db");
const tenantId = "tenant-pay-promo";
const otherTenant = "tenant-pay-promo-other";
const user = { id: "u-pay-promo", name: "Owner", email: "o@x.sa", tenantId };

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
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

async function setup() {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  const { createDiscountCode } = await import("../lib/promo-codes");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.plan.upsert({ where: { id: "plan-pp" }, update: {}, create: { id: "plan-pp", name: "خطة تجربة الخصم", monthlyPrice: 200, employeeLimit: 3, active: 1, createdAt: now, updatedAt: now } });
  await createDiscountCode({ name: "عام", code: "GENERAL10", discountType: "percentage", discountValue: 10, usageLimit: 5, usageLimitPerUser: 5 });
  await createDiscountCode({ name: "للخطة", code: "PLANONLY", discountType: "percentage", discountValue: 50, applicablePlanIds: ["plan-pp"], usageLimit: 5, usageLimitPerUser: 5 });
  await createDiscountCode({ name: "جدد", code: "NEWONLY", discountType: "fixed", discountValue: 20, newUsersOnly: true, usageLimit: 5, usageLimitPerUser: 5 });

  await prisma.subscriptionPayment.create({
    data: { id: "sub-pay-1", tenantId, amount: 200, amountHalalas: 20000, status: "قيد الانتظار", createdAt: now, planName: "خطة تجربة الخصم", planEmployeeLimit: 3, planMessageQuota: 0, listPrice: 200, billingCycle: "شهري", initiatedBy: "owner" } as never
  });
  await prisma.campaignPayment.create({
    data: { id: "pay-camp-1", tenantId, messages: 1000, amount: 100, amountHalalas: 10000, status: "قيد الانتظار", createdAt: now, initiatedBy: "owner" } as never
  });
}

describe("discount code on the payment page", () => {
  it("applies, swaps and removes a code on a pending subscription payment", async () => {
    await setup();
    const { setSubscriptionPaymentPromo } = await import("../lib/promo-codes");
    const { prisma } = await import("../lib/prisma");

    const applied = await setSubscriptionPaymentPromo(user, "sub-pay-1", "general10");
    expect(applied).toMatchObject({ ok: true, amount: 180, discountAmount: 20, code: "GENERAL10" });
    let row = await prisma.subscriptionPayment.findUnique({ where: { id: "sub-pay-1" } });
    expect(row).toMatchObject({ amount: 180, amountHalalas: 18000, promoCode: "GENERAL10", discountAmount: 20 });
    expect((await prisma.discountCode.findUnique({ where: { code: "GENERAL10" } }))?.usedCount).toBe(1);

    // Swapping to a plan-bound code re-prices from the original price and frees the first code's use.
    const swapped = await setSubscriptionPaymentPromo(user, "sub-pay-1", "PLANONLY");
    expect(swapped).toMatchObject({ ok: true, amount: 100, discountAmount: 100 });
    expect((await prisma.discountCode.findUnique({ where: { code: "GENERAL10" } }))?.usedCount).toBe(0);
    expect((await prisma.discountCode.findUnique({ where: { code: "PLANONLY" } }))?.usedCount).toBe(1);

    // A bad code leaves the previous state untouched.
    const bad = await setSubscriptionPaymentPromo(user, "sub-pay-1", "NOPE");
    expect(bad.ok).toBe(false);
    row = await prisma.subscriptionPayment.findUnique({ where: { id: "sub-pay-1" } });
    expect(row?.promoCode).toBe("PLANONLY");
    expect(row?.amount).toBe(100);

    const removed = await setSubscriptionPaymentPromo(user, "sub-pay-1", "");
    expect(removed).toMatchObject({ ok: true, amount: 200, discountAmount: 0, code: "" });
    expect((await prisma.discountCode.findUnique({ where: { code: "PLANONLY" } }))?.usedCount).toBe(0);
  });

  it("never touches another workspace's payment", async () => {
    const { setSubscriptionPaymentPromo } = await import("../lib/promo-codes");
    const result = await setSubscriptionPaymentPromo({ ...user, tenantId: otherTenant }, "sub-pay-1", "GENERAL10");
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("applies only general codes to a campaign top-up", async () => {
    const { setCampaignPaymentPromo, getPaymentPromoSummary } = await import("../lib/promo-codes");
    const { prisma } = await import("../lib/prisma");

    const ok = await setCampaignPaymentPromo(user, "pay-camp-1", "GENERAL10", 100);
    expect(ok).toMatchObject({ ok: true, amount: 90, discountAmount: 10 });
    expect((await prisma.campaignPayment.findUnique({ where: { id: "pay-camp-1" } }))).toMatchObject({ amount: 90, amountHalalas: 9000 });
    expect(await getPaymentPromoSummary("pay-camp-1")).toMatchObject({ code: "GENERAL10", originalAmount: 100, discountAmount: 10 });

    // Plan-bound and new-customer codes are subscription codes.
    for (const code of ["PLANONLY", "NEWONLY"]) {
      const rejected = await setCampaignPaymentPromo(user, "pay-camp-1", code, 100);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.error).toContain("شحن رصيد الحملات");
    }

    const removed = await setCampaignPaymentPromo(user, "pay-camp-1", "", 100);
    expect(removed).toMatchObject({ ok: true, amount: 100 });
    expect(await getPaymentPromoSummary("pay-camp-1")).toBeNull();
  });

  it("marks the code used once the top-up is paid", async () => {
    const { setCampaignPaymentPromo } = await import("../lib/promo-codes");
    const { applyConfirmedCampaignPayment } = await import("../lib/subscriptions");
    const { prisma } = await import("../lib/prisma");
    await setCampaignPaymentPromo(user, "pay-camp-1", "GENERAL10", 100);
    const result = await applyConfirmedCampaignPayment("pay-camp-1");
    expect(result.credited).toBe(true);
    const usage = await prisma.discountCodeUsage.findFirst({ where: { paymentId: "pay-camp-1" } });
    expect(usage?.paymentStatus).toBe("completed");
  });
});
