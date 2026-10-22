import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-owner-sync.db");
const tenantId = "tenant-owner-sync";
vi.setConfig({ testTimeout: 120_000 });

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

describe("the subscription follows the workspace owner", () => {
  it("renaming the owner or changing their email updates the subscription record", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: "شركة رينول", ownerName: "محمد عبدالبصير", ownerEmail: "old@example.test", plan: "الباقة العادية", status: "تجربة", employeeLimit: 3, amount: 0, billingCycle: "شهري", renewalAt: now, createdAt: now, updatedAt: now } });
    await prisma.employee.create({ data: { id: "emp-owner", name: "الحمراني", email: "ismail@example.test", role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "ا", tenantId } });
    await prisma.employee.create({ data: { id: "emp-agent", name: "موظف", email: "agent@example.test", role: "موظف", status: "متصل", permissions: "محادثات فقط", initial: "م", tenantId } });

    const { syncSubscriptionOwner } = await import("../lib/subscriptions");
    expect(await syncSubscriptionOwner(tenantId)).toBe(true);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).toMatchObject({ ownerName: "الحمراني", ownerEmail: "ismail@example.test", companyName: "شركة رينول" });
    // Already in step: nothing to write.
    expect(await syncSubscriptionOwner(tenantId)).toBe(false);
  });

  it("corrects every workspace once per process", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.subscription.update({ where: { tenantId }, data: { ownerName: "قديم" } });
    const { syncAllSubscriptionOwners } = await import("../lib/subscriptions");
    expect(await syncAllSubscriptionOwners()).toBe(1);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })).ownerName).toBe("الحمراني");
    expect(await syncAllSubscriptionOwners()).toBe(0);
  });
});
