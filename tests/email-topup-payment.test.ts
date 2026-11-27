import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-email-topup-payment.db");
const tenantId = "tenant-email-topup";
const amountHalalas = 5000;

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-email-topup", name: "Owner", email: "owner@email-topup.example", role: "مالك الحساب", tenantId }))
}));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));

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

async function pendingTopUp(id: string, extra: { moyasarId?: string; createdAt?: string } = {}) {
  const { prisma } = await import("../lib/prisma");
  await prisma.campaignPayment.create({
    data: { id, tenantId, messages: 1000, amount: 50, amountHalalas, status: "قيد الانتظار", createdAt: new Date().toISOString(), ...extra }
  });
}

/** Moyasar knows the payment by its Payment id only; the invoice lookup misses, as it does for the embedded checkout. */
function mockMoyasar(id: string, status: string, rowId: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/invoices/")
    ? new Response("Not Found", { status: 404 })
    : new Response(JSON.stringify({ id, status, amount: amountHalalas, currency: "SAR", metadata: { payment_id: rowId }, source: { type: "creditcard", company: "visa" } }), { status: 200 })));
}

async function confirm(route: "email-promotions/balance" | "campaigns/balance", paymentId: string, moyasarPaymentId: string) {
  const { POST } = route === "campaigns/balance"
    ? await import("../app/api/campaigns/balance/confirm-payment/route")
    : await import("../app/api/email-promotions/balance/confirm-payment/route");
  const response = await POST(new NextRequest(`http://localhost/api/${route}/confirm-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId, moyasarPaymentId })
  }));
  return await response.json() as { outcome?: string };
}

async function balances() {
  const { prisma } = await import("../lib/prisma");
  const { getEmailCampaignBalance } = await import("../lib/email-promotions");
  return { email: await getEmailCampaignBalance(tenantId), whatsapp: (await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance ?? 0 };
}

describe("email credit paid by card", () => {
  it("waits through 3-D Secure, then credits the email balance once", async () => {
    const { prisma } = await import("../lib/prisma");
    await pendingTopUp("pay-email-3ds");
    const before = await balances();

    // on_completed fires before the redirect to the bank, while the payment is only started.
    mockMoyasar("pay_3ds", "initiated", "pay-email-3ds");
    expect((await confirm("email-promotions/balance", "pay-email-3ds", "pay_3ds")).outcome).toBe("pending");
    expect(await prisma.campaignPayment.findUnique({ where: { id: "pay-email-3ds" } })).toMatchObject({ status: "قيد الانتظار", moyasarId: "pay_3ds" });

    // Back from the bank: /billing/success confirms again.
    mockMoyasar("pay_3ds", "paid", "pay-email-3ds");
    expect((await confirm("email-promotions/balance", "pay-email-3ds", "pay_3ds")).outcome).toBe("completed");
    expect((await confirm("email-promotions/balance", "pay-email-3ds", "pay_3ds")).outcome).toBe("completed");
    expect(await balances()).toEqual({ email: before.email + 1000, whatsapp: before.whatsapp });
  });

  it("marks a declined card as failed and adds nothing", async () => {
    const { prisma } = await import("../lib/prisma");
    await pendingTopUp("pay-email-declined");
    const before = await balances();
    mockMoyasar("pay_declined", "failed", "pay-email-declined");
    expect((await confirm("email-promotions/balance", "pay-email-declined", "pay_declined")).outcome).toBe("failed");
    expect((await prisma.campaignPayment.findUnique({ where: { id: "pay-email-declined" } }))?.status).toBe("فشل");
    expect(await balances()).toEqual(before);
  });

  it("never turns into WhatsApp messages, even through the campaign confirm route", async () => {
    await pendingTopUp("pay-email-wrong-route");
    const before = await balances();
    mockMoyasar("pay_wrong_route", "paid", "pay-email-wrong-route");
    await confirm("campaigns/balance", "pay-email-wrong-route", "pay_wrong_route");
    expect(await balances()).toEqual({ email: before.email + 1000, whatsapp: before.whatsapp });
  });

  it("cannot be added by asking for it, without a payment", async () => {
    expect(await import("../app/api/email-promotions/balance/route")).not.toHaveProperty("POST");
  });

  it("is credited to the email balance by the sweep when the customer never came back", async () => {
    const { reconcileStalePendingPayments } = await import("../lib/subscriptions");
    await pendingTopUp("pay-email-stale", { moyasarId: "pay_stale", createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString() });
    const before = await balances();
    mockMoyasar("pay_stale", "paid", "pay-email-stale");
    expect((await reconcileStalePendingPayments()).reconciled).toBe(1);
    expect(await balances()).toEqual({ email: before.email + 1000, whatsapp: before.whatsapp });
  });
});
