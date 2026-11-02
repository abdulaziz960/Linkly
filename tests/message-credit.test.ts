import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-message-credit.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

describe("the rules", () => {
  it("keeps only the bought part of a balance, taking the plan's part as spent first", async () => {
    const { purchasedPortion, renewPlanCredit, addPurchasedCredit, UNKNOWN_PURCHASED } = await import("../lib/message-credit");
    expect(purchasedPortion(200, 1200, 0)).toBe(200);
    expect(purchasedPortion(200, 100, 0)).toBe(100); // spent into the bought part
    expect(purchasedPortion(UNKNOWN_PURCHASED, 400, 300)).toBe(300); // not split yet: worked out from the payments
    expect(purchasedPortion(UNKNOWN_PURCHASED, 100, 300)).toBe(100);
    expect(purchasedPortion(UNKNOWN_PURCHASED, 400, 0)).toBe(0);

    expect(renewPlanCredit({ balance: 400, purchased: 0, boughtEver: 0, allowance: 1000 })).toEqual({ balance: 1000, purchased: 0 });
    expect(renewPlanCredit({ balance: 1200, purchased: 200, boughtEver: 200, allowance: 1000 })).toEqual({ balance: 1200, purchased: 200 });
    expect(renewPlanCredit({ balance: 900, purchased: UNKNOWN_PURCHASED, boughtEver: 500, allowance: 1000 })).toEqual({ balance: 1500, purchased: 500 });

    expect(addPurchasedCredit({ balance: 1000, purchased: 0, messages: 200 })).toEqual({ balance: 1200, purchased: 200 });
    expect(addPurchasedCredit({ balance: 100, purchased: 200, messages: 50 })).toEqual({ balance: 150, purchased: 150 });
    // Not split yet: stays "worked out from the payments", which already include this one.
    expect(addPurchasedCredit({ balance: 400, purchased: UNKNOWN_PURCHASED, messages: 50 })).toEqual({ balance: 450, purchased: UNKNOWN_PURCHASED });
  });
});

async function renew(tenantId: string, paymentId: string, quota = 1000, cycle: "شهري" | "سنوي" = "شهري") {
  const { prisma } = await import("../lib/prisma");
  const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
  await prisma.subscriptionPayment.create({
    data: { id: paymentId, tenantId, amount: 199, amountHalalas: 19900, status: "قيد الانتظار", planName: "باقة اختبار الرصيد", planEmployeeLimit: 1, planMessageQuota: quota, billingCycle: cycle, createdAt: new Date().toISOString() }
  });
  await applyConfirmedSubscriptionPayment(paymentId, { gateway: "test", gatewayStatus: "paid" });
  return (await prisma.campaignBalance.findUnique({ where: { tenantId } }))!;
}

describe("WhatsApp message credit at renewal", () => {
  it("starts every month from the plan's allowance, month after month, and not from what was left", async () => {
    const { prisma } = await import("../lib/prisma");
    const tenantId = "tenant-credit-monthly";
    expect((await renew(tenantId, "pay-credit-monthly-1")).balance).toBe(1000);
    await prisma.campaignBalance.update({ where: { tenantId }, data: { balance: 700 } }); // 300 sent
    expect((await renew(tenantId, "pay-credit-monthly-2")).balance).toBe(1000);
    expect((await renew(tenantId, "pay-credit-monthly-3")).balance).toBe(1000);
  });

  it("keeps what the customer bought and what was added by hand, whether or not they spent the plan's part", async () => {
    const { prisma } = await import("../lib/prisma");
    const { creditCampaignBalance, addManualCampaignBalance } = await import("../lib/campaign-engine");
    const tenantId = "tenant-credit-bought";
    await renew(tenantId, "pay-credit-bought-1"); // 1000, all plan
    await creditCampaignBalance(tenantId, 200); // bought (webhook path)
    await addManualCampaignBalance(tenantId, 100, 0); // added by the platform team
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))).toMatchObject({ balance: 1300, purchasedBalance: 300 });

    // Used 200: all out of the plan's part, so the bought part is intact.
    await prisma.campaignBalance.update({ where: { tenantId }, data: { balance: 1100 } });
    expect((await renew(tenantId, "pay-credit-bought-2")).balance).toBe(1300);

    // Used 1100 of 1300: the plan's 1000 first, then 100 of the bought part, so 200 of it remain.
    await prisma.campaignBalance.update({ where: { tenantId }, data: { balance: 200 } });
    const third = await renew(tenantId, "pay-credit-bought-3");
    expect(third).toMatchObject({ balance: 1200, purchasedBalance: 200 });
  });

  it("works out the bought part from the payments for a balance that was built up before this rule", async () => {
    const { prisma } = await import("../lib/prisma");
    const tenantId = "tenant-credit-legacy";
    const now = new Date().toISOString();
    // A customer who bought 500 once, with 1400 now: 900 are unused plan allowance that carried over.
    await prisma.campaignPayment.create({ data: { id: "legacy-topup", tenantId, messages: 500, amount: 50, amountHalalas: 5000, status: "مكتمل", createdAt: now, completedAt: now, gateway: "moyasar" } });
    await prisma.campaignBalance.create({ data: { tenantId, balance: 1400, lastTopUpAmount: 500, updatedAt: now } });
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.purchasedBalance).toBe(-1);
    const after = await renew(tenantId, "pay-credit-legacy-1");
    expect(after).toMatchObject({ balance: 1500, purchasedBalance: 500 });
  });

  it("gives an annual payment the whole year's allowance and replaces it at the next annual renewal", async () => {
    const tenantId = "tenant-credit-annual";
    expect((await renew(tenantId, "pay-credit-annual-1", 1000, "سنوي")).balance).toBe(12000);
    expect((await renew(tenantId, "pay-credit-annual-2", 1000, "سنوي")).balance).toBe(12000);
  });
});

describe("email credit", () => {
  it("counts a purchase as kept credit but not the one given back for a failed send", async () => {
    const { prisma } = await import("../lib/prisma");
    const { creditEmailCampaignBalance } = await import("../lib/email-promotions");
    const tenantId = "tenant-credit-email";
    await creditEmailCampaignBalance(tenantId, 300); // bought
    await prisma.emailCampaignBalance.update({ where: { tenantId }, data: { balance: { decrement: 10 } } }); // one send reserves a credit
    await creditEmailCampaignBalance(tenantId, 1, "refund"); // the send failed
    const row = await prisma.emailCampaignBalance.findUnique({ where: { tenantId } });
    expect(row?.balance).toBe(291);
    // A balance that began after the split knows what was bought: the 300, which a renewal keeps as far as the balance still holds it.
    expect(row?.purchasedBalance).toBe(300);
  });
});
