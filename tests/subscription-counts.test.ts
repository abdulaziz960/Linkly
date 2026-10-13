import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-subscription-counts.db");

// A cold database is created on first use; under a loaded full-suite run that can take longer than the default 30s.
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

const now = new Date().toISOString();

async function seed() {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const subscription = (tenantId: string) => prisma.subscription.upsert({
    where: { tenantId },
    update: {},
    create: { id: `sub-${tenantId}`, tenantId, companyName: tenantId, ownerName: "o", ownerEmail: `${tenantId}@x.example`, plan: "p", status: "نشط", employeeLimit: 3, amount: 0, billingCycle: "شهري", renewalAt: now, createdAt: now, updatedAt: now }
  });
  await subscription("tenant-count-a");
  await subscription("tenant-count-b");
  const customer = (tenantId: string) => prisma.customer.upsert({ where: { id: `cust-${tenantId}` }, update: {}, create: { id: `cust-${tenantId}`, name: "c", phone: tenantId, initial: "c", tenantId } });
  await customer("tenant-count-a");
  await customer("tenant-count-b");
  return { prisma };
}

async function addConversation(prisma: Awaited<ReturnType<typeof seed>>["prisma"], id: string, tenantId: string) {
  await prisma.conversation.create({ data: { id, tenantId, customerId: `cust-${tenantId}`, lastMessage: "", status: "unassigned", assignee: "" } });
}

describe("subscription lists", () => {
  it("getSubscriptions adds per-tenant employee, conversation and balance totals", async () => {
    const { prisma } = await seed();
    const { getSubscriptions } = await import("../lib/subscriptions");
    await addConversation(prisma, "conv-count-a1", "tenant-count-a");
    await addConversation(prisma, "conv-count-a2", "tenant-count-a");
    await addConversation(prisma, "conv-count-b1", "tenant-count-b");
    await prisma.employee.create({ data: { id: "emp-count-a", name: "e", role: "موظف دعم", status: "متصل", permissions: "", email: "e@a.example", initial: "e", tenantId: "tenant-count-a" } });

    const rows = await getSubscriptions();
    const a = rows.find((row) => row.tenantId === "tenant-count-a");
    const b = rows.find((row) => row.tenantId === "tenant-count-b");
    expect(a).toMatchObject({ conversationCount: 2, employeeCount: 1, campaignBalance: 0 });
    expect(b).toMatchObject({ conversationCount: 1, employeeCount: 0 });
  });

  it("getSubscriptionRows and the no-counts visible list skip the totals", async () => {
    await seed();
    const { getSubscriptionRows } = await import("../lib/subscriptions");
    const { getVisibleSubscriptions } = await import("../lib/admin-hidden-clients");
    const rows = await getSubscriptionRows();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]).not.toHaveProperty("conversationCount");

    const visible = await getVisibleSubscriptions({ withCounts: false });
    expect(visible[0]).not.toHaveProperty("employeeCount");
    expect(visible.map((row) => row.tenantId)).toEqual(expect.arrayContaining(["tenant-count-a", "tenant-count-b"]));
  });

  it("hidden clients are left out of both forms", async () => {
    const { prisma } = await seed();
    await prisma.adminHiddenClient.upsert({ where: { tenantId: "tenant-count-b" }, create: { tenantId: "tenant-count-b", hiddenAt: now, hiddenBy: "t" }, update: {} });
    const { getVisibleSubscriptions } = await import("../lib/admin-hidden-clients");
    expect((await getVisibleSubscriptions()).map((row) => row.tenantId)).not.toContain("tenant-count-b");
    expect((await getVisibleSubscriptions({ withCounts: false })).map((row) => row.tenantId)).not.toContain("tenant-count-b");
    await prisma.adminHiddenClient.deleteMany({ where: { tenantId: "tenant-count-b" } });
  });
});

describe("the totals scan is shared between reads", () => {
  it("serves cached totals until they are cleared", async () => {
    vi.stubEnv("ADMIN_COUNTS_CACHE_MS", "60000");
    const { prisma } = await seed();
    const { getSubscriptions, clearSubscriptionCountsCache } = await import("../lib/subscriptions");
    clearSubscriptionCountsCache();

    const countFor = async () => (await getSubscriptions()).find((row) => row.tenantId === "tenant-count-b")?.conversationCount;
    const before = await countFor();
    await addConversation(prisma, `conv-count-b-extra-${Date.now()}`, "tenant-count-b");

    expect(await countFor()).toBe(before); // still the cached scan
    clearSubscriptionCountsCache();
    expect(await countFor()).toBe((before ?? 0) + 1);
    vi.stubEnv("ADMIN_COUNTS_CACHE_MS", "0");
  });
});
