import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-payment-replay-guard.db");
const tenantId = "tenant-payment-replay";

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-payment-replay",
    name: "Replay Tenant Owner",
    email: "owner@payment-replay.example",
    role: "مالك الحساب",
    tenantId
  }))
}));

vi.mock("../lib/permissions-server", () => ({
  userHasViewPermission: vi.fn(async () => true)
}));

function mockPaidMoyasarPayment(amountHalalas: number) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    id: "pay_reused_123",
    status: "paid",
    amount: amountHalalas,
    currency: "SAR",
    metadata: {},
    source: { type: "creditcard", company: "visa" }
  }), { status: 200 })));
}

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

describe("Moyasar payment id reuse across different rows", () => {
  it("refuses to credit a second campaign top-up with an already-completed payment id", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const amount = 500;
    const amountHalalas = 50000;
    const makePending = (id: string) => prisma.campaignPayment.create({
      data: {
        id,
        tenantId,
        messages: 1000,
        amount,
        amountHalalas,
        status: "قيد الانتظار",
        createdAt: new Date().toISOString()
      }
    });

    await makePending("camp-pay-first");
    await makePending("camp-pay-second");

    const { POST } = await import("../app/api/campaigns/balance/confirm-payment/route");

    mockPaidMoyasarPayment(amountHalalas);
    const first = await POST(new NextRequest("http://localhost/api/campaigns/balance/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: "camp-pay-first", moyasarPaymentId: "pay_reused_123" })
    }));
    expect(first.status).toBe(200);
    expect((await first.json()).outcome).toBe("completed");

    const balanceAfterFirst = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balanceAfterFirst?.balance).toBe(1000);

    mockPaidMoyasarPayment(amountHalalas);
    const second = await POST(new NextRequest("http://localhost/api/campaigns/balance/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: "camp-pay-second", moyasarPaymentId: "pay_reused_123" })
    }));
    expect(second.status).toBe(409);

    const secondRow = await prisma.campaignPayment.findUnique({ where: { id: "camp-pay-second" } });
    expect(secondRow?.status).toBe("قيد الانتظار");

    const balanceAfterSecond = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balanceAfterSecond?.balance).toBe(1000);
  });

  it("refuses to renew a second subscription payment with an already-completed payment id", async () => {
    const { prisma } = await import("../lib/prisma");
    const amount = 300;
    const amountHalalas = 30000;
    const makePending = (id: string) => prisma.subscriptionPayment.create({
      data: {
        id,
        tenantId,
        amount,
        amountHalalas,
        status: "قيد الانتظار",
        createdAt: new Date().toISOString()
      }
    });

    await makePending("sub-pay-first");
    await makePending("sub-pay-second");

    const { POST } = await import("../app/api/billing/confirm-payment/route");

    mockPaidMoyasarPayment(amountHalalas);
    const first = await POST(new NextRequest("http://localhost/api/billing/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: "sub-pay-first", moyasarPaymentId: "pay_reused_sub_1" })
    }));
    expect(first.status).toBe(200);

    mockPaidMoyasarPayment(amountHalalas);
    const second = await POST(new NextRequest("http://localhost/api/billing/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: "sub-pay-second", moyasarPaymentId: "pay_reused_sub_1" })
    }));
    expect(second.status).toBe(409);

    const secondRow = await prisma.subscriptionPayment.findUnique({ where: { id: "sub-pay-second" } });
    expect(secondRow?.status).toBe("قيد الانتظار");
  });
});
