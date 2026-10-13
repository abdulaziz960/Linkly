import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-admin-logs.db");

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

async function seed() {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  await prisma.adminLog.deleteMany({});
  const rows = [
    // Written before created_at existed: no timestamp, random-looking id.
    { id: "legacy-zzz", at: "1 يناير 2026", createdAt: "", clientId: "tenant-a", message: "legacy" },
    { id: "log-1", at: "x", createdAt: "2026-10-01T10:00:00.000Z", clientId: "tenant-a", message: "oldest" },
    { id: "log-9", at: "x", createdAt: "2026-10-02T10:00:00.000Z", clientId: "tenant-b", message: "middle" },
    { id: "log-5", at: "x", createdAt: "2026-10-03T10:00:00.000Z", clientId: "tenant-a", message: "newest" },
    { id: "log-3", at: "x", createdAt: "2026-10-03T09:00:00.000Z", clientId: "tenant-hidden", message: "hidden" }
  ];
  for (const row of rows) await prisma.adminLog.create({ data: { ...row, clientName: "n", source: "s", level: "معلومة" } });
  return { prisma };
}

describe("getRecentAdminLogs", () => {
  it("returns the newest rows first, by timestamp rather than id", async () => {
    await seed();
    const { getRecentAdminLogs } = await import("../lib/database");
    const logs = await getRecentAdminLogs({ limit: 10 });
    expect(logs.map((log) => log.message)).toEqual(["newest", "hidden", "middle", "oldest", "legacy"]);
  });

  it("is bounded by the limit", async () => {
    await seed();
    const { getRecentAdminLogs } = await import("../lib/database");
    expect(await getRecentAdminLogs({ limit: 2 })).toHaveLength(2);
    expect((await getRecentAdminLogs({ limit: 0 })).length).toBe(1);
    expect((await getRecentAdminLogs({ limit: 999999 })).length).toBeLessThanOrEqual(1000);
  });

  it("can be narrowed to one client or hide clients", async () => {
    await seed();
    const { getRecentAdminLogs } = await import("../lib/database");
    const forA = await getRecentAdminLogs({ clientId: "tenant-a" });
    expect(forA.map((log) => log.message)).toEqual(["newest", "oldest", "legacy"]);
    const visible = await getRecentAdminLogs({ excludeClientIds: ["tenant-hidden"] });
    expect(visible.map((log) => log.message)).not.toContain("hidden");
    expect(visible).toHaveLength(4);
  });

  it("does not leak the internal timestamp field into the rows", async () => {
    await seed();
    const { getRecentAdminLogs } = await import("../lib/database");
    expect(Object.keys((await getRecentAdminLogs({ limit: 1 }))[0]).sort()).toEqual(["at", "clientId", "clientName", "id", "level", "message", "source"]);
  });
});

describe("rows written by the app", () => {
  it("logAdminAction stamps created_at so new entries sort first", async () => {
    const { prisma } = await seed();
    const { logAdminAction } = await import("../lib/subscriptions");
    const { getRecentAdminLogs } = await import("../lib/database");
    await logAdminAction("tenant-a", "A", "just now");
    const [first] = await getRecentAdminLogs({ limit: 1 });
    expect(first.message).toBe("just now");
    const stored = await prisma.adminLog.findFirst({ where: { message: "just now" } });
    expect(Date.parse(stored?.createdAt || "")).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("notifications", () => {
  it("shows the newest logs and skips hidden clients", async () => {
    await seed();
    const { prisma } = await import("../lib/prisma");
    await prisma.adminHiddenClient.upsert({ where: { tenantId: "tenant-hidden" }, create: { tenantId: "tenant-hidden", hiddenAt: new Date().toISOString(), hiddenBy: "test" }, update: {} });
    const { getAdminNotifications } = await import("../lib/notifications");
    const items = await getAdminNotifications();
    const titles = items.filter((item) => item.type === "log").map((item) => item.title);
    expect(titles[0]).toBe("newest");
    expect(titles).not.toContain("hidden");
  });
});

describe("ensureAdminLogsSchema", () => {
  it("is safe to run again", async () => {
    await seed();
    const { ensureAdminLogsSchema } = await import("../lib/admin-logs-schema");
    await expect(ensureAdminLogsSchema()).resolves.toBeUndefined();
    await expect(ensureAdminLogsSchema()).resolves.toBeUndefined();
  });
});
