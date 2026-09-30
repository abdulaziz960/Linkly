import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-promo-codes.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_unit");
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

async function seedPlan(id: string, name: string, monthlyPrice: number) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.plan.upsert({
    where: { id },
    update: {},
    create: { id, name, monthlyPrice, employeeLimit: 3, active: 1, createdAt: now, updatedAt: now }
  });
}

async function seedTenant(tenantId: string) {
  const { prisma } = await import("../lib/prisma");
  const now = new Date().toISOString();
  await prisma.userAccount.create({
    data: { id: `user-${tenantId}`, name: "Owner", email: `owner-${tenantId}@promo.example`, passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now }
  });
}

describe("normalizePromoCode", () => {
  it("trims, uppercases, and strips internal whitespace", async () => {
    const { normalizePromoCode } = await import("../lib/promo-codes");
    expect(normalizePromoCode("  welcome 20  ")).toBe("WELCOME20");
    expect(normalizePromoCode("Welcome20")).toBe("WELCOME20");
  });
});

describe("computeDiscountAmount", () => {
  it("computes a percentage discount", async () => {
    const { computeDiscountAmount } = await import("../lib/promo-codes");
    const result = computeDiscountAmount({ discountType: "percentage", discountValue: 20, maxDiscountAmount: 0 }, 200);
    expect(result).toBe(40);
  });

  it("computes a fixed discount", async () => {
    const { computeDiscountAmount } = await import("../lib/promo-codes");
    const result = computeDiscountAmount({ discountType: "fixed", discountValue: 50, maxDiscountAmount: 0 }, 200);
    expect(result).toBe(50);
  });

  it("caps a percentage discount at the maximum discount amount", async () => {
    const { computeDiscountAmount } = await import("../lib/promo-codes");
    const result = computeDiscountAmount({ discountType: "percentage", discountValue: 20, maxDiscountAmount: 100 }, 1000);
    expect(result).toBe(100);
  });

  it("never discounts more than the amount itself", async () => {
    const { computeDiscountAmount } = await import("../lib/promo-codes");
    const result = computeDiscountAmount({ discountType: "fixed", discountValue: 500, maxDiscountAmount: 0 }, 200);
    expect(result).toBe(200);
  });
});

describe("validatePromoCode", () => {
  it("rejects a code that does not exist", async () => {
    const { validatePromoCode } = await import("../lib/promo-codes");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const result = await validatePromoCode({ code: "NOPE", tenantId: "tenant-x", planId: "plan-x", planName: "Plan", amountSar: 200 });
    expect(result).toEqual({ ok: false, errorCode: "INVALID_CODE" });
  });

  it("rejects an inactive code", async () => {
    const { createDiscountCode, validatePromoCode } = await import("../lib/promo-codes");
    await seedPlan("plan-validate-1", "Plan Validate 1", 200);
    const code = await createDiscountCode({ name: "Test", code: "INACTIVE10", discountType: "percentage", discountValue: 10 });
    const { prisma } = await import("../lib/prisma");
    await prisma.discountCode.update({ where: { id: code.id }, data: { active: 0 } });

    const result = await validatePromoCode({ code: "INACTIVE10", tenantId: "tenant-inactive", planId: "plan-validate-1", planName: "Plan Validate 1", amountSar: 200 });
    expect(result).toEqual({ ok: false, errorCode: "INACTIVE" });
  });

  it("rejects a code that has expired", async () => {
    const { createDiscountCode, validatePromoCode } = await import("../lib/promo-codes");
    await seedPlan("plan-validate-2", "Plan Validate 2", 200);
    await createDiscountCode({ name: "Test", code: "EXPIRED10", discountType: "percentage", discountValue: 10, expiresAt: new Date(Date.now() - 86_400_000).toISOString() });

    const result = await validatePromoCode({ code: "EXPIRED10", tenantId: "tenant-expired", planId: "plan-validate-2", planName: "Plan Validate 2", amountSar: 200 });
    expect(result).toEqual({ ok: false, errorCode: "EXPIRED" });
  });

  it("rejects a code not applicable to the selected plan", async () => {
    const { createDiscountCode, validatePromoCode } = await import("../lib/promo-codes");
    await seedPlan("plan-validate-3a", "Plan Validate 3A", 200);
    await seedPlan("plan-validate-3b", "Plan Validate 3B", 300);
    await createDiscountCode({ name: "Test", code: "PROONLY", discountType: "percentage", discountValue: 10, applicablePlanIds: ["plan-validate-3a"] });

    const result = await validatePromoCode({ code: "PROONLY", tenantId: "tenant-wrong-plan", planId: "plan-validate-3b", planName: "Plan Validate 3B", amountSar: 300 });
    expect(result).toEqual({ ok: false, errorCode: "WRONG_PLAN" });
  });

  it("rejects a code below the minimum subscription amount", async () => {
    const { createDiscountCode, validatePromoCode } = await import("../lib/promo-codes");
    await seedPlan("plan-validate-4", "Plan Validate 4", 50);
    await createDiscountCode({ name: "Test", code: "MIN100", discountType: "fixed", discountValue: 10, minimumAmount: 100 });

    const result = await validatePromoCode({ code: "MIN100", tenantId: "tenant-below-min", planId: "plan-validate-4", planName: "Plan Validate 4", amountSar: 50 });
    expect(result).toEqual({ ok: false, errorCode: "BELOW_MINIMUM" });
  });

  it("rejects a new-users-only code for a tenant with a past completed payment, even with no active subscription", async () => {
    const { createDiscountCode, validatePromoCode } = await import("../lib/promo-codes");
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await seedPlan("plan-validate-5", "Plan Validate 5", 200);
    await createDiscountCode({ name: "Test", code: "NEWONLY10", discountType: "percentage", discountValue: 10, newUsersOnly: true });

    const tenantId = "tenant-past-customer";
    const now = new Date().toISOString();
    // This tenant paid once, then their subscription lapsed/was cancelled -
    // no active Subscription row exists, only a completed payment history.
    await prisma.subscriptionPayment.create({
      data: { id: `pay-${tenantId}`, tenantId, amount: 200, amountHalalas: 20000, status: "مكتمل", createdAt: now, completedAt: now }
    });

    const result = await validatePromoCode({ code: "NEWONLY10", tenantId, planId: "plan-validate-5", planName: "Plan Validate 5", amountSar: 200 });
    expect(result).toEqual({ ok: false, errorCode: "EXISTING_CUSTOMER" });
  });

  it("accepts a new-users-only code for a tenant with no payment history at all", async () => {
    const { createDiscountCode, validatePromoCode } = await import("../lib/promo-codes");
    await seedPlan("plan-validate-6", "Plan Validate 6", 200);
    await createDiscountCode({ name: "Test", code: "NEWONLY20", discountType: "percentage", discountValue: 20, newUsersOnly: true });

    const result = await validatePromoCode({ code: "NEWONLY20", tenantId: "tenant-brand-new", planId: "plan-validate-6", planName: "Plan Validate 6", amountSar: 200 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(40);
  });
});

describe("reservePromoCodeUsage", () => {
  it("increments used_count and creates a pending usage row on success", async () => {
    const { createDiscountCode, reservePromoCodeUsage } = await import("../lib/promo-codes");
    const { prisma } = await import("../lib/prisma");
    await seedPlan("plan-reserve-1", "Plan Reserve 1", 200);
    const code = await createDiscountCode({ name: "Test", code: "RESERVE1", discountType: "fixed", discountValue: 40, usageLimit: 5 });

    const result = await prisma.$transaction(async (tx) => {
      return reservePromoCodeUsage(tx, {
        code: "RESERVE1",
        tenantId: "tenant-reserve-1",
        planId: "plan-reserve-1",
        planName: "Plan Reserve 1",
        amountSar: 200,
        paymentId: "pay-reserve-1",
        userId: "user-1",
        userName: "Owner",
        email: "owner@reserve.example"
      });
    });

    expect(result).toEqual({ ok: true, discountAmount: 40, finalAmount: 160 });
    const updated = await prisma.discountCode.findUnique({ where: { id: code.id } });
    expect(updated?.usedCount).toBe(1);
    const usage = await prisma.discountCodeUsage.findFirst({ where: { paymentId: "pay-reserve-1" } });
    expect(usage?.paymentStatus).toBe("pending");
  });

  it("refuses a second reservation once the usage limit is reached, without double counting", async () => {
    const { createDiscountCode, reservePromoCodeUsage } = await import("../lib/promo-codes");
    const { prisma } = await import("../lib/prisma");
    await seedPlan("plan-reserve-2", "Plan Reserve 2", 200);
    await createDiscountCode({ name: "Test", code: "LIMIT1", discountType: "fixed", discountValue: 20, usageLimit: 1, usageLimitPerUser: 5 });

    const firstAttempt = await prisma.$transaction(async (tx) => reservePromoCodeUsage(tx, {
      code: "LIMIT1",
      tenantId: "tenant-race-a",
      planId: "plan-reserve-2",
      planName: "Plan Reserve 2",
      amountSar: 200,
      paymentId: "pay-race-a",
      userId: "user-a",
      userName: "A",
      email: "a@race.example"
    }));
    expect(firstAttempt.ok).toBe(true);

    // A second tenant racing for the same last remaining slot - simulates
    // the concurrent-checkout scenario the CAS increment guards against.
    const secondAttempt = await prisma.$transaction(async (tx) => reservePromoCodeUsage(tx, {
      code: "LIMIT1",
      tenantId: "tenant-race-b",
      planId: "plan-reserve-2",
      planName: "Plan Reserve 2",
      amountSar: 200,
      paymentId: "pay-race-b",
      userId: "user-b",
      userName: "B",
      email: "b@race.example"
    }));
    expect(secondAttempt).toEqual({ ok: false, errorCode: "USAGE_LIMIT" });

    const code = await prisma.discountCode.findUnique({ where: { code: "LIMIT1" } });
    expect(code?.usedCount).toBe(1);
    const pendingRowForB = await prisma.discountCodeUsage.findFirst({ where: { paymentId: "pay-race-b" } });
    expect(pendingRowForB).toBeNull();
  });
});

describe("releasePromoCodeUsage", () => {
  it("decrements used_count and frees the code when a reservation is released", async () => {
    const { createDiscountCode, reservePromoCodeUsage, releasePromoCodeUsage, validatePromoCode } = await import("../lib/promo-codes");
    const { prisma } = await import("../lib/prisma");
    await seedPlan("plan-release-1", "Plan Release 1", 200);
    await createDiscountCode({ name: "Test", code: "RELEASE1", discountType: "fixed", discountValue: 20, usageLimit: 1 });

    await prisma.$transaction(async (tx) => reservePromoCodeUsage(tx, {
      code: "RELEASE1",
      tenantId: "tenant-release-a",
      planId: "plan-release-1",
      planName: "Plan Release 1",
      amountSar: 200,
      paymentId: "pay-release-a",
      userId: "user-a",
      userName: "A",
      email: "a@release.example"
    }));

    const beforeRelease = await validatePromoCode({ code: "RELEASE1", tenantId: "tenant-release-b", planId: "plan-release-1", planName: "Plan Release 1", amountSar: 200 });
    expect(beforeRelease).toEqual({ ok: false, errorCode: "USAGE_LIMIT" });

    // The first checkout never completed payment (card declined) - its
    // reservation must be released so the code becomes available again.
    await releasePromoCodeUsage("pay-release-a", "failed");

    const code = await prisma.discountCode.findUnique({ where: { code: "RELEASE1" } });
    expect(code?.usedCount).toBe(0);

    const afterRelease = await validatePromoCode({ code: "RELEASE1", tenantId: "tenant-release-b", planId: "plan-release-1", planName: "Plan Release 1", amountSar: 200 });
    expect(afterRelease.ok).toBe(true);
  });

  it("does nothing for a payment that never had a reservation", async () => {
    const { releasePromoCodeUsage } = await import("../lib/promo-codes");
    await expect(releasePromoCodeUsage("pay-never-existed", "expired")).resolves.toBeUndefined();
  });
});
