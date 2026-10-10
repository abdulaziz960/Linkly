import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-subscription-access.db");
const HOUR = 3_600_000;

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seed(tenantId: string, status: string, renewalAt: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.subscription.create({
    data: { id: `sub-${tenantId}`, tenantId, companyName: tenantId, ownerName: "Owner", ownerEmail: `${tenantId}@example.test`, plan: "باقة", status, employeeLimit: 3, amount: 0, billingCycle: "شهري", renewalAt, createdAt: now, updatedAt: now }
  });
}

describe("trial expiry boundary (server-side)", () => {
  it("is still active just before 72 hours and expired just after", async () => {
    const { getSubscriptionAccess } = await import("../lib/auth");
    await seed("trial-before", "تجربة", new Date(Date.now() + HOUR).toISOString());
    await seed("trial-after", "تجربة", new Date(Date.now() - HOUR).toISOString());
    expect(await getSubscriptionAccess("trial-before")).toMatchObject({ expired: false });
    expect(await getSubscriptionAccess("trial-after")).toMatchObject({ expired: true });
  });

  it("is not extended by the paid grace-period setting", async () => {
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "7");
    const { getSubscriptionAccess } = await import("../lib/auth");
    await seed("trial-grace-env", "تجربة", new Date(Date.now() - HOUR).toISOString());
    expect(await getSubscriptionAccess("trial-grace-env")).toMatchObject({ expired: true });
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "");
  });
});

describe("paid grace period boundary", () => {
  it("keeps access on day 6 and locks after day 7 when the setting is 7", async () => {
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "7");
    const { getSubscriptionAccess } = await import("../lib/auth");
    const iso = (days: number) => new Date(Date.now() - days * 24 * HOUR).toISOString();
    await seed("paid-day6", "نشط", iso(6));
    await seed("paid-day8", "نشط", iso(8));
    expect(await getSubscriptionAccess("paid-day6")).toMatchObject({ expired: false, overdue: true });
    expect(await getSubscriptionAccess("paid-day8")).toMatchObject({ expired: true, overdue: true });
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "");
  });

  it("never locks a paid subscription for non-renewal when the setting is unset (documents the opt-in)", async () => {
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "");
    const { getSubscriptionAccess } = await import("../lib/auth");
    await seed("paid-30-unset", "نشط", new Date(Date.now() - 30 * 24 * HOUR).toISOString());
    expect(await getSubscriptionAccess("paid-30-unset")).toMatchObject({ expired: false, overdue: true });
  });

  it("locks a suspended subscription regardless of dates", async () => {
    const { getSubscriptionAccess } = await import("../lib/auth");
    await seed("suspended", "متوقف", new Date(Date.now() + 30 * 24 * HOUR).toISOString());
    expect(await getSubscriptionAccess("suspended")).toMatchObject({ expired: true });
  });
});
