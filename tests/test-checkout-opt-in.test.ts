import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-test-checkout-opt-in.db");
const tenantId = "tenant-test-checkout-opt-in";

const user = { id: "user-test-checkout-opt-in", name: "Owner", email: "owner@test-checkout-opt-in.example", role: "مالك الحساب", tenantId };

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => user)
}));

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();

  await prisma.plan.create({
    data: { id: "plan-opt-in-test", name: "خطة الاختبار", monthlyPrice: 100, employeeLimit: 5, active: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  });
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
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

describe("simulated (no-real-payment) checkout requires an explicit opt-in", () => {
  it("checkout refuses to stage a simulated payment in a non-production env with no Moyasar key and no opt-in", async () => {
    const { POST } = await import("../app/api/billing/checkout/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "plan-opt-in-test" })
    }));
    expect(response.status).toBe(503);

    const { prisma } = await import("../lib/prisma");
    expect(await prisma.subscriptionPayment.findFirst({ where: { tenantId } })).toBeNull();
  });

  it("checkout stages a simulated payment once ENABLE_TEST_CHECKOUT=true is explicitly set", async () => {
    vi.stubEnv("ENABLE_TEST_CHECKOUT", "true");
    const { POST } = await import("../app/api/billing/checkout/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "plan-opt-in-test" })
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as { paymentUrl?: string };
    expect(payload.paymentUrl).toContain("/checkout/test");
  });

  it("confirm-test refuses to activate a subscription without the opt-in even though the payment row exists", async () => {
    const { prisma } = await import("../lib/prisma");
    const paymentId = "sub-pay-opt-in-confirm";
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId,
        tenantId,
        amount: 100,
        amountHalalas: 10000,
        status: "قيد الانتظار",
        moyasarId: `test_${paymentId}`,
        planName: "خطة الاختبار",
        planEmployeeLimit: 5,
        createdAt: new Date().toISOString()
      }
    });

    const { POST } = await import("../app/api/billing/confirm-test/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/confirm-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId })
    }));
    expect(response.status).toBe(403);

    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    expect(payment?.status).toBe("قيد الانتظار");
  });

  it("confirm-test activates the subscription once ENABLE_TEST_CHECKOUT=true is set", async () => {
    vi.stubEnv("ENABLE_TEST_CHECKOUT", "true");
    const { prisma } = await import("../lib/prisma");
    const paymentId = "sub-pay-opt-in-confirm-2";
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId,
        tenantId,
        amount: 100,
        amountHalalas: 10000,
        status: "قيد الانتظار",
        moyasarId: `test_${paymentId}`,
        planName: "خطة الاختبار",
        planEmployeeLimit: 5,
        createdAt: new Date().toISOString()
      }
    });

    const { POST } = await import("../app/api/billing/confirm-test/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/confirm-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId })
    }));
    expect(response.status).toBe(200);

    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    expect(payment?.status).toBe("مكتمل");
  });
});
