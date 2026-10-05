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

function jsonRequest(url: string, body: unknown, apiKey?: string, method: string = "POST") {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: method === "DELETE" ? undefined : JSON.stringify(body)
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

describe("POST /api/v1/products", () => {
  it("returns the created items with id, externalId and status - not just counts", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/products/route");
    const { rawKey } = await generateApiKey(tenantId, "products route test key");

    const response = await POST(jsonRequest("https://example.test/api/v1/products", {
      externalId: "sku-route-test-1",
      name: "Test product",
      price: 10
    }, rawKey));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.created).toBe(1);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({ externalId: "sku-route-test-1", status: "created" });
    expect(body.data.items[0].id).toBeTruthy();
  });

  it("upserts on a repeat externalId - second call reports updated, not created", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/products/route");
    const { rawKey } = await generateApiKey(tenantId, "products upsert test key");

    const payload = { externalId: "sku-route-test-upsert", name: "Test product", price: 10 };
    const first = await (await POST(jsonRequest("https://example.test/api/v1/products", payload, rawKey))).json();
    const second = await (await POST(jsonRequest("https://example.test/api/v1/products", { ...payload, name: "Renamed" }, rawKey))).json();

    expect(first.data.items[0].status).toBe("created");
    expect(second.data.items[0].status).toBe("updated");
    expect(second.data.items[0].id).toBe(first.data.items[0].id);
  });
});

describe("DELETE /api/v1/products/:id", () => {
  it("deletes a product created moments earlier, by its internal id", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/products/route");
    const { DELETE } = await import("../app/api/v1/products/[id]/route");
    const { rawKey } = await generateApiKey(tenantId, "products delete by id test key");

    const createBody = await (await POST(jsonRequest("https://example.test/api/v1/products", {
      externalId: "sku-route-delete-by-id", name: "Test product", price: 10
    }, rawKey))).json();
    const internalId: string = createBody.data.items[0].id;

    const response = await DELETE(jsonRequest(`https://example.test/api/v1/products/${internalId}`, null, rawKey, "DELETE"), { params: Promise.resolve({ id: internalId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(internalId);
  });

  it("deletes a product by its externalId instead of the internal id", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/products/route");
    const { DELETE } = await import("../app/api/v1/products/[id]/route");
    const { rawKey } = await generateApiKey(tenantId, "products delete by externalId test key");

    await POST(jsonRequest("https://example.test/api/v1/products", {
      externalId: "sku-route-delete-by-external", name: "Test product", price: 10
    }, rawKey));

    const response = await DELETE(jsonRequest("https://example.test/api/v1/products/sku-route-delete-by-external", null, rawKey, "DELETE"), { params: Promise.resolve({ id: "sku-route-delete-by-external" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("returns 404 for a product that does not belong to this key's tenant", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/products/route");
    const { DELETE } = await import("../app/api/v1/products/[id]/route");
    const { rawKey: ownerKey } = await generateApiKey(tenantId, "products cross-tenant owner key");
    const { rawKey: otherKey } = await generateApiKey("tenant-public-api-routes-test-other", "products cross-tenant other key");

    const createBody = await (await POST(jsonRequest("https://example.test/api/v1/products", {
      externalId: "sku-route-cross-tenant", name: "Test product", price: 10
    }, ownerKey))).json();
    const internalId: string = createBody.data.items[0].id;

    const response = await DELETE(jsonRequest(`https://example.test/api/v1/products/${internalId}`, null, otherKey, "DELETE"), { params: Promise.resolve({ id: internalId }) });
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
