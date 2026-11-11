import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-push-before-automations.db");
const sendNotification = vi.fn(async () => undefined);
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));
// An auto-reply step that breaks must not take the device notification down with it.
vi.mock("../lib/work-hours", () => ({ checkOffHoursAutoReply: vi.fn(async () => { throw new Error("off-hours step broke"); }) }));

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

describe("the notification for an incoming message", () => {
  it("is sent even when a later step fails, and each conversation gets its own tag", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    const { saveSubscription } = await import("../lib/push-notifications");
    const { runInboundMessageAutomations } = await import("../lib/automation-engine");
    await ensureSchema();
    for (const id of ["a", "b"]) {
      await prisma.customer.create({ data: { id: `cust-${id}`, tenantId: "t-push-first", name: `عميل ${id}`, phone: `9665000000${id === "a" ? 1 : 2}`, initial: "ع" } });
      await prisma.conversation.create({ data: { id: `conv-${id}`, tenantId: "t-push-first", customerId: `cust-${id}`, lastMessage: "x", status: "unassigned", assignee: "" } });
    }
    await saveSubscription("u1", "t-push-first", { endpoint: "https://push.example/first", keys: { p256dh: "p", auth: "a" } });

    await expect(runInboundMessageAutomations("conv-a", "t-push-first", "السلام عليكم")).rejects.toThrow("off-hours step broke");
    await expect(runInboundMessageAutomations("conv-b", "t-push-first", "مرحبا")).rejects.toThrow();

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const tags = sendNotification.mock.calls.map((call) => JSON.parse((call as unknown as [unknown, string])[1]).tag);
    expect(tags).toEqual(["conversation-conv-a", "conversation-conv-b"]);
  });
});
