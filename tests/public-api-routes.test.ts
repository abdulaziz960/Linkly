import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-public-api-routes.db");
const tenantId = "tenant-public-api-routes-test";

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

function jsonRequest(url: string, body: unknown, apiKey?: string) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/v1/conversations", () => {
  it("rejects a request with no API key", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { POST } = await import("../app/api/v1/conversations/route");

    const response = await POST(jsonRequest("https://example.test/api/v1/conversations", { customerPhone: "0501234567", text: "hi" }));
    expect(response.status).toBe(401);
  });

  it("rejects a request with an invalid API key", async () => {
    const { POST } = await import("../app/api/v1/conversations/route");
    const response = await POST(jsonRequest("https://example.test/api/v1/conversations", { customerPhone: "0501234567", text: "hi" }, "lk_not-a-real-key"));
    expect(response.status).toBe(401);
  });

  it("creates a conversation with a valid API key", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { rawKey } = await generateApiKey(tenantId, "route test key");

    const response = await POST(jsonRequest("https://example.test/api/v1/conversations", {
      customerPhone: "0501234567",
      customerName: "عميل تجريبي",
      text: "طلب جديد #100"
    }, rawKey));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.conversationId).toBeTruthy();
  });

  it("rejects an invalid phone number", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { rawKey } = await generateApiKey(tenantId, "invalid phone test key");

    const response = await POST(jsonRequest("https://example.test/api/v1/conversations", { customerPhone: "not-a-phone", text: "hi" }, rawKey));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/messages", () => {
  it("rejects a request with no API key", async () => {
    const { POST } = await import("../app/api/v1/messages/route");
    const response = await POST(jsonRequest("https://example.test/api/v1/messages", { conversationId: "conv-1", text: "hi" }));
    expect(response.status).toBe(401);
  });

  it("returns 404 for a conversation that doesn't belong to the key's tenant", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/messages/route");
    const { rawKey } = await generateApiKey(tenantId, "messages route test key");

    const response = await POST(jsonRequest("https://example.test/api/v1/messages", { conversationId: "conv-does-not-exist", text: "hi" }, rawKey));
    expect(response.status).toBe(404);
  });
});

describe("public API rate limiting", () => {
  // Every app/api/v1/* route calls consumeRateLimit("public-api", rawKey, 60, 60_000)
  // with the identical namespace/limit/window - exercising the shared
  // rate-limit table directly (rather than 61 full conversation-creation
  // round-trips through the route) proves the same thing without the cost
  // and DB-contention flakiness of hammering the route that many times.
  it("allows exactly 60 requests per key per window, then blocks", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { consumeRateLimit } = await import("../lib/rate-limit");
    const { rawKey } = await generateApiKey(tenantId, "rate limit test key");

    let allowedCount = 0;
    let blocked = false;
    for (let i = 0; i < 61; i++) {
      const result = await consumeRateLimit("public-api", rawKey, 60, 60_000);
      if (result.allowed) allowedCount++;
      else blocked = true;
    }

    expect(allowedCount).toBe(60);
    expect(blocked).toBe(true);
  });
});
