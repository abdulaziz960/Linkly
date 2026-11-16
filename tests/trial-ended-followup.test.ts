import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-trial-ended.db");
const sendTrialEndedEmail = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../lib/email", async (original) => ({ ...(await original<object>()), sendTrialEndedEmail }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

describe("trial-ended follow-up", () => {
  it("emails the owner once, only for trials that ended recently", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { sendTrialEndedFollowUps } = await import("../lib/subscriptions");
    await ensureSchema();
    const now = new Date();
    const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
    const make = async (tenantId: string, renewalAt: string) => {
      await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: tenantId, ownerName: "مالك", ownerEmail: `${tenantId}@example.com`, plan: "تجربة", status: "تجربة", employeeLimit: 3, amount: 0, billingCycle: "تجربة", renewalAt, createdAt: now.toISOString(), updatedAt: now.toISOString() } });
      await prisma.userAccount.create({ data: { id: `u-${tenantId}`, email: `${tenantId}@example.com`, name: "مالك", passwordHash: "x", tenantId, role: "مالك الحساب", createdAt: now.toISOString() } });
    };
    await make("t-just-ended", at(-2));
    await make("t-old", at(-24 * 10));
    await make("t-running", at(48));

    expect(await sendTrialEndedFollowUps("https://example.test")).toEqual({ sent: 1 });
    expect(sendTrialEndedEmail).toHaveBeenCalledTimes(1);
    expect(sendTrialEndedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "t-just-ended@example.com" }));
    expect(await sendTrialEndedFollowUps("https://example.test")).toEqual({ sent: 0 });
  });
});
