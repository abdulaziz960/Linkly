import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-webhooks.db");
const tenantId = "tenant-webhooks-test";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerWebhookEvent", () => {
  it("only calls webhooks subscribed to the fired event", async () => {
    const { createWebhook, triggerWebhookEvent } = await import("../lib/webhooks");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return new Response("ok", { status: 200 });
    }));

    await createWebhook(tenantId, { url: "https://example.com/message-hook", events: ["message.received"] });
    await createWebhook(tenantId, { url: "https://example.com/close-hook", events: ["conversation.closed"] });

    await triggerWebhookEvent(tenantId, "message.received", { conversationId: "conv-1" });

    expect(calls).toEqual(["https://example.com/message-hook"]);
  });

  it("writes a WebhookDelivery row per attempt, recording httpStatus and success", async () => {
    const { createWebhook, triggerWebhookEvent, listWebhookDeliveries } = await import("../lib/webhooks");
    const { prisma } = await import("../lib/prisma");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));

    const webhook = await createWebhook(tenantId, { url: "https://example.com/delivery-log-hook", events: ["conversation.closed"] });
    await triggerWebhookEvent(tenantId, "conversation.closed", { conversationId: "conv-2" });

    const deliveries = await listWebhookDeliveries(tenantId, webhook.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].httpStatus).toBe(200);
    expect(deliveries[0].success).toBe(1);
    void prisma;
  });

  it("logs a failed delivery when the receiving endpoint errors, without throwing", async () => {
    const { createWebhook, triggerWebhookEvent, listWebhookDeliveries } = await import("../lib/webhooks");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));

    const webhook = await createWebhook(tenantId, { url: "https://example.com/failing-hook", events: ["message.received"] });
    await expect(triggerWebhookEvent(tenantId, "message.received", { conversationId: "conv-3" })).resolves.toBeUndefined();

    const deliveries = await listWebhookDeliveries(tenantId, webhook.id);
    expect(deliveries[0].httpStatus).toBe(500);
    expect(deliveries[0].success).toBe(0);
  });

  it("signs the payload with an HMAC the docs' verification snippet can validate", async () => {
    const { createWebhook, triggerWebhookEvent } = await import("../lib/webhooks");

    let capturedBody = "";
    let capturedSignature = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body);
      capturedSignature = (init.headers as Record<string, string>)["X-Linkly-Signature"];
      return new Response("ok", { status: 200 });
    }));

    const webhook = await createWebhook(tenantId, { url: "https://example.com/signed-hook", events: ["message.received"] });
    await triggerWebhookEvent(tenantId, "message.received", { conversationId: "conv-4" });

    const expected = `sha256=${createHmac("sha256", webhook.secret).update(capturedBody).digest("hex")}`;
    expect(capturedSignature).toBe(expected);
  });
});
