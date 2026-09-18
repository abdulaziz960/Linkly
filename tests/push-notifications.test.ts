import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-push-notifications.db");
const tenantId = "tenant-push-test";

const sendNotification = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification
  }
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
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
  sendNotification.mockReset();
});

describe("push-notifications", () => {
  it("saveSubscription upserts by endpoint, and notifyTenant sends to every device for that tenant", async () => {
    const { saveSubscription, notifyTenant } = await import("../lib/push-notifications");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    await saveSubscription("user-1", tenantId, { endpoint: "https://push.example/device-a", keys: { p256dh: "p1", auth: "a1" } });
    await saveSubscription("user-2", tenantId, { endpoint: "https://push.example/device-b", keys: { p256dh: "p2", auth: "a2" } });
    sendNotification.mockResolvedValue(undefined);

    await notifyTenant(tenantId, { title: "عميل اختبار", body: "رسالة جديدة", url: "/dashboard?view=inbox" });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const endpoints = sendNotification.mock.calls.map((call) => call[0].endpoint).sort();
    expect(endpoints).toEqual(["https://push.example/device-a", "https://push.example/device-b"]);
  });

  it("re-subscribing the same endpoint updates the row instead of duplicating it", async () => {
    const { saveSubscription, notifyTenant } = await import("../lib/push-notifications");
    sendNotification.mockResolvedValue(undefined);

    await saveSubscription("user-1", tenantId, { endpoint: "https://push.example/device-dup", keys: { p256dh: "old", auth: "old" } });
    await saveSubscription("user-1", tenantId, { endpoint: "https://push.example/device-dup", keys: { p256dh: "new", auth: "new" } });

    await notifyTenant(tenantId, { title: "t", body: "b", url: "/dashboard" });
    const dupCalls = sendNotification.mock.calls.filter((call) => call[0].endpoint === "https://push.example/device-dup");
    expect(dupCalls).toHaveLength(1);
    expect(dupCalls[0][0].keys).toEqual({ p256dh: "new", auth: "new" });
  });

  it("deletes the subscription when the push service reports it gone (410), so future sends don't keep failing on it", async () => {
    const { saveSubscription, notifyTenant } = await import("../lib/push-notifications");
    const { prisma } = await import("../lib/prisma");

    await saveSubscription("user-3", tenantId, { endpoint: "https://push.example/device-gone", keys: { p256dh: "p3", auth: "a3" } });
    sendNotification.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint === "https://push.example/device-gone") {
        const error = new Error("Gone") as Error & { statusCode: number };
        error.statusCode = 410;
        throw error;
      }
    });

    await notifyTenant(tenantId, { title: "t", body: "b", url: "/dashboard" });

    const remaining = await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example/device-gone" } });
    expect(remaining).toBeNull();
  });

  it("removeSubscription deletes by endpoint", async () => {
    const { saveSubscription, removeSubscription } = await import("../lib/push-notifications");
    const { prisma } = await import("../lib/prisma");

    await saveSubscription("user-4", tenantId, { endpoint: "https://push.example/device-remove", keys: { p256dh: "p4", auth: "a4" } });
    await removeSubscription("https://push.example/device-remove");

    const remaining = await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example/device-remove" } });
    expect(remaining).toBeNull();
  });
});
