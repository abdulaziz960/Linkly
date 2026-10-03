import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-same-plan-renewal.db");
const tenantId = "tenant-same-plan-renewal";
const user = { id: "user-same-plan", name: "Owner", email: "owner@same-plan.example", role: "مالك الحساب", tenantId };

vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));

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

const day = 86_400_000;
const active = (daysLeft: number, extra = {}) => ({ plan: "P", status: "نشط", billingCycle: "شهري", renewalAt: new Date(Date.now() + daysLeft * day).toISOString(), ...extra });

describe("isSamePlanRenewalTooEarly", () => {
  it("blocks the same plan and cycle while paid up beyond the 7-day window", async () => {
    const { isSamePlanRenewalTooEarly } = await import("../lib/billing-pricing");
    expect(isSamePlanRenewalTooEarly(active(25), "P", "شهري")).toBe(true);
  });

  it("allows renewal inside the window, when overdue, on another plan, another cycle, a trial, or no subscription", async () => {
    const { isSamePlanRenewalTooEarly } = await import("../lib/billing-pricing");
    expect(isSamePlanRenewalTooEarly(active(5), "P", "شهري")).toBe(false);
    expect(isSamePlanRenewalTooEarly(active(-2), "P", "شهري")).toBe(false);
    expect(isSamePlanRenewalTooEarly(active(25), "Q", "شهري")).toBe(false);
    expect(isSamePlanRenewalTooEarly(active(25), "P", "سنوي")).toBe(false);
    expect(isSamePlanRenewalTooEarly(active(25, { status: "تجربة" }), "P", "شهري")).toBe(false);
    expect(isSamePlanRenewalTooEarly(active(25, { status: "متوقف" }), "P", "شهري")).toBe(false);
    expect(isSamePlanRenewalTooEarly(null, "P", "شهري")).toBe(false);
  });
});

describe("checkout refuses to stack a payment on an active same plan", () => {
  it("returns 409 for the same plan, but still allows an upgrade to another plan", async () => {
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.plan.createMany({ data: [
      { id: "plan-sp-a", name: "باقة أ", monthlyPrice: 300, employeeLimit: 3, active: 1, createdAt: now, updatedAt: now },
      { id: "plan-sp-b", name: "باقة ب", monthlyPrice: 600, employeeLimit: 6, active: 1, createdAt: now, updatedAt: now }
    ] });
    await prisma.subscription.create({ data: {
      id: `sub-${tenantId}`, tenantId, companyName: "Co", ownerName: "Owner", ownerEmail: user.email, plan: "باقة أ",
      status: "نشط", employeeLimit: 3, amount: 300, billingCycle: "شهري", renewalAt: new Date(Date.now() + 25 * day).toISOString(), createdAt: now, updatedAt: now
    } });
    const { POST } = await import("../app/api/billing/checkout/route");
    const post = (planId: string) => POST(new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, billingCycle: "شهري" })
    }));
    expect((await post("plan-sp-a")).status).toBe(409);
    expect((await post("plan-sp-b")).status).toBe(200);
  });
});
