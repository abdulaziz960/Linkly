import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-push-test.db");
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

describe("test notification", () => {
  it("reports no devices, then what the push service did for each registered device", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { saveSubscription, sendTestPush } = await import("../lib/push-notifications");
    await ensureSchema();
    const payload = { title: "t", body: "b", url: "/dashboard" };

    expect(await sendTestPush("u-1", payload)).toMatchObject({ configured: true, devices: 0, accepted: 0 });

    await saveSubscription("u-1", "t-1", { endpoint: "https://push.example/ok", keys: { p256dh: "a", auth: "b" } });
    await saveSubscription("u-1", "t-1", { endpoint: "https://push.example/gone", keys: { p256dh: "a", auth: "b" } });
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    expect(await sendTestPush("u-1", payload)).toMatchObject({ devices: 2, accepted: 1, gone: 1, failed: 0 });
    // The dead device was dropped, so the next test sees one device.
    expect(await sendTestPush("u-1", payload)).toMatchObject({ devices: 1, accepted: 1 });
  });
});
