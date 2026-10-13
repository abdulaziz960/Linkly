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
  vi.unstubAllGlobals();
});

describe("triggerWebhookEvent", () => {
  it("only calls webhooks subscribed to the fired event", async () => {
    const testTenantId = `${tenantId}-subscriptions`;
    const { createWebhook, triggerWebhookEvent } = await import("../lib/webhooks");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return new Response("ok", { status: 200 });
    }));

    await createWebhook(testTenantId, { url: "https://example.com/message-hook", events: ["message.received"] });
    await createWebhook(testTenantId, { url: "https://example.com/close-hook", events: ["conversation.closed"] });

    await triggerWebhookEvent(testTenantId, "message.received", { conversationId: "conv-1" });

    expect(calls).toEqual(["https://example.com/message-hook"]);
  });

  it("writes a WebhookDelivery row per attempt, recording httpStatus and success", async () => {
    const testTenantId = `${tenantId}-delivery-log`;
    const { createWebhook, triggerWebhookEvent, listWebhookDeliveries } = await import("../lib/webhooks");
    const { prisma } = await import("../lib/prisma");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));

    const webhook = await createWebhook(testTenantId, { url: "https://example.com/delivery-log-hook", events: ["conversation.closed"] });
    await triggerWebhookEvent(testTenantId, "conversation.closed", { conversationId: "conv-2" });

    const deliveries = await listWebhookDeliveries(testTenantId, webhook.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].httpStatus).toBe(200);
    expect(deliveries[0].success).toBe(1);
    void prisma;
  });

  it("logs a failed delivery when the receiving endpoint errors, without throwing", async () => {
    const testTenantId = `${tenantId}-failed-delivery`;
    const { createWebhook, triggerWebhookEvent, listWebhookDeliveries } = await import("../lib/webhooks");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));

    const webhook = await createWebhook(testTenantId, { url: "https://example.com/failing-hook", events: ["message.received"] });
    await expect(triggerWebhookEvent(testTenantId, "message.received", { conversationId: "conv-3" })).resolves.toBeUndefined();

    const deliveries = await listWebhookDeliveries(testTenantId, webhook.id);
    expect(deliveries[0].httpStatus).toBe(500);
    expect(deliveries[0].success).toBe(0);
  });

  it("signs the payload with an HMAC the docs' verification snippet can validate", async () => {
    const testTenantId = `${tenantId}-signature`;
    const { createWebhook, triggerWebhookEvent } = await import("../lib/webhooks");

    let capturedBody = "";
    let capturedSignature = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body);
      capturedSignature = (init.headers as Record<string, string>)["X-Linkly-Signature"];
      return new Response("ok", { status: 200 });
    }));

    const webhook = await createWebhook(testTenantId, { url: "https://example.com/signed-hook", events: ["message.received"] });
    await triggerWebhookEvent(testTenantId, "message.received", { conversationId: "conv-4" });

    const expected = `sha256=${createHmac("sha256", webhook.secret).update(capturedBody).digest("hex")}`;
    expect(capturedSignature).toBe(expected);
  });

  it("delivers lead.created with the lead's fields and a valid signature", async () => {
    const testTenantId = `${tenantId}-lead-created`;
    const { createWebhook, triggerWebhookEvent } = await import("../lib/webhooks");

    let capturedBody = "";
    let capturedSignature = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body);
      capturedSignature = (init.headers as Record<string, string>)["X-Linkly-Signature"];
      return new Response("ok", { status: 200 });
    }));

    const webhook = await createWebhook(testTenantId, { url: "https://example.com/lead-hook", events: ["lead.created"] });
    await triggerWebhookEvent(testTenantId, "lead.created", { id: "lead-1", source: "snapchat", name: "عميل محتمل" });

    const parsed = JSON.parse(capturedBody);
    expect(parsed.event).toBe("lead.created");
    expect(parsed.data).toMatchObject({ id: "lead-1", source: "snapchat", name: "عميل محتمل" });

    const expected = `sha256=${createHmac("sha256", webhook.secret).update(capturedBody).digest("hex")}`;
    expect(capturedSignature).toBe(expected);
  });
});

describe("webhook retries", () => {
  async function setup(suffix: string, status: number, events: string[] = ["message.received"]) {
    const testTenantId = `${tenantId}-retry-${suffix}`;
    const { createWebhook, triggerWebhookEvent } = await import("../lib/webhooks");
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("x", { status }));
    vi.stubGlobal("fetch", fetchMock);
    const webhook = await createWebhook(testTenantId, { url: `https://example.com/retry-${suffix}`, events });
    await triggerWebhookEvent(testTenantId, "message.received", { conversationId: `conv-${suffix}` });
    return { testTenantId, webhook, prisma, fetchMock };
  }

  async function makeDue(prisma: Awaited<ReturnType<typeof setup>>["prisma"], webhookId: string) {
    await prisma.webhookRetry.updateMany({ where: { webhookId }, data: { nextAttemptAt: new Date(Date.now() - 1000).toISOString() } });
  }

  it("queues a retry when the endpoint answers 5xx, and sends delivery headers with a timeout", async () => {
    const { webhook, prisma, fetchMock } = await setup("5xx", 503);

    const rows = await prisma.webhookRetry.findMany({ where: { webhookId: webhook.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", attempts: 1, lastStatus: 503, event: "message.received" });
    expect(Date.parse(rows[0].nextAttemptAt)).toBeGreaterThan(Date.now());

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Linkly-Event"]).toBe("message.received");
    expect(headers["X-Linkly-Delivery"]).toBe(rows[0].id);
    expect(headers["X-Linkly-Attempt"]).toBe("1");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("queues a retry when the request itself fails (network error or timeout)", async () => {
    const testTenantId = `${tenantId}-retry-network`;
    const { createWebhook, triggerWebhookEvent } = await import("../lib/webhooks");
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("socket hang up"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const webhook = await createWebhook(testTenantId, { url: "https://example.com/retry-network", events: ["message.received"] });
    await triggerWebhookEvent(testTenantId, "message.received", { conversationId: "conv-network" });

    const rows = await prisma.webhookRetry.findMany({ where: { webhookId: webhook.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].lastStatus).toBe(0);
  });

  it("does not queue a retry for a 4xx answer", async () => {
    const { webhook, prisma } = await setup("4xx", 404);
    expect(await prisma.webhookRetry.count({ where: { webhookId: webhook.id } })).toBe(0);
  });

  it("does not queue a retry after a successful delivery", async () => {
    const { webhook, prisma } = await setup("ok", 200);
    expect(await prisma.webhookRetry.count({ where: { webhookId: webhook.id } })).toBe(0);
  });

  it("delivers a due retry, reusing the same body and delivery id, and marks it done", async () => {
    const { webhook, prisma, fetchMock } = await setup("deliver", 500);
    const { processWebhookRetries } = await import("../lib/webhooks");
    const [row] = await prisma.webhookRetry.findMany({ where: { webhookId: webhook.id } });
    const firstBody = String((fetchMock.mock.calls[0][1] as RequestInit).body);

    // Not due yet: nothing is sent.
    expect(await processWebhookRetries()).toMatchObject({ attempted: 0 });

    await makeDue(prisma, webhook.id);
    fetchMock.mockImplementation(async () => new Response("ok", { status: 200 }));
    const totals = await processWebhookRetries();
    expect(totals).toMatchObject({ attempted: 1, delivered: 1, dead: 0 });

    const retryInit = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as RequestInit;
    expect(String(retryInit.body)).toBe(firstBody);
    expect((retryInit.headers as Record<string, string>)["X-Linkly-Delivery"]).toBe(row.id);
    expect((retryInit.headers as Record<string, string>)["X-Linkly-Attempt"]).toBe("2");

    const after = await prisma.webhookRetry.findUnique({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "done", attempts: 2, lastStatus: 200 });
    expect(await prisma.webhookDelivery.count({ where: { webhookId: webhook.id } })).toBe(2);
  });

  it("schedules the next, longer wait after another failure", async () => {
    const { webhook, prisma } = await setup("again", 500);
    const { processWebhookRetries, WEBHOOK_RETRY_DELAYS_MS } = await import("../lib/webhooks");

    await makeDue(prisma, webhook.id);
    const before = Date.now();
    await processWebhookRetries();

    const [row] = await prisma.webhookRetry.findMany({ where: { webhookId: webhook.id } });
    expect(row).toMatchObject({ status: "pending", attempts: 2 });
    const wait = Date.parse(row.nextAttemptAt) - before;
    expect(wait).toBeGreaterThan(WEBHOOK_RETRY_DELAYS_MS[1] - 5000);
    expect(wait).toBeLessThan(WEBHOOK_RETRY_DELAYS_MS[1] + 5000);
  });

  it("gives up after the last attempt and marks the delivery dead", async () => {
    const { webhook, prisma } = await setup("dead", 500);
    const { processWebhookRetries, WEBHOOK_RETRY_DELAYS_MS } = await import("../lib/webhooks");

    // Five attempts have already been made; the sixth is the last one.
    await prisma.webhookRetry.updateMany({
      where: { webhookId: webhook.id },
      data: { attempts: WEBHOOK_RETRY_DELAYS_MS.length, nextAttemptAt: new Date(Date.now() - 1000).toISOString() }
    });
    expect(await processWebhookRetries()).toMatchObject({ attempted: 1, dead: 1 });

    const [row] = await prisma.webhookRetry.findMany({ where: { webhookId: webhook.id } });
    expect(row).toMatchObject({ status: "dead", attempts: WEBHOOK_RETRY_DELAYS_MS.length + 1 });
    expect(await processWebhookRetries()).toMatchObject({ attempted: 0 });
  });

  it("cancels the retry when the webhook was switched off, and drops it when the webhook is deleted", async () => {
    const { testTenantId, webhook, prisma, fetchMock } = await setup("cancel", 500);
    const { processWebhookRetries, updateWebhook, deleteWebhook } = await import("../lib/webhooks");

    await updateWebhook(testTenantId, webhook.id, { active: false });
    await makeDue(prisma, webhook.id);
    const callsBefore = fetchMock.mock.calls.length;
    expect(await processWebhookRetries()).toMatchObject({ attempted: 0, cancelled: 1 });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);

    const second = await setup("cancel-delete", 500);
    expect(await second.prisma.webhookRetry.count({ where: { webhookId: second.webhook.id } })).toBe(1);
    expect(await deleteWebhook(second.testTenantId, second.webhook.id)).toBe(true);
    expect(await second.prisma.webhookRetry.count({ where: { webhookId: second.webhook.id } })).toBe(0);
  });

  it("does not pick the same retry up twice while it is being delivered", async () => {
    const { webhook, prisma, fetchMock } = await setup("lease", 500);
    const { processWebhookRetries } = await import("../lib/webhooks");

    await makeDue(prisma, webhook.id);
    fetchMock.mockImplementation(async () => new Response("ok", { status: 200 }));
    const [first, second] = await Promise.all([processWebhookRetries(), processWebhookRetries()]);
    expect(first.delivered + second.delivered).toBe(1);
  });
});
