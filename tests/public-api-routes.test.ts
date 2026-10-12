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

  it("accepts the form-style field names and keeps the extra answers on the lead", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { prisma } = await import("../lib/prisma");
    const { rawKey } = await generateApiKey(tenantId, "form fields test key");

    const response = await POST(jsonRequest("https://example.test/api/v1/conversations", {
      full_name: "خالد الحربي",
      phone_number: "0507654321",
      email: "khaled@example.com",
      budget: "900,000",
      purchase_purpose: "استثمار",
      purchase_method: "نقدًا",
      preferred_contact_time: "مساءً"
    }, rawKey));
    const body = await response.json();
    expect(response.status).toBe(200);

    const messages = await prisma.message.findMany({ where: { conversationId: body.data.conversationId }, orderBy: { createdAt: "asc" } });
    const text = messages.map((message) => message.text).join("\n");
    expect(text).toContain("• الميزانية: 900,000");
    expect(text).toContain("• وقت التواصل المفضل: مساءً");
    const lead = await prisma.lead.findFirst({ where: { tenantId, conversationId: body.data.conversationId } });
    expect(lead).toMatchObject({ email: "khaled@example.com", name: "خالد الحربي", source: "api" });
  });

  it("accepts a Zapier Form payload (form-encoded) with the common names", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { prisma } = await import("../lib/prisma");
    const { rawKey } = await generateApiKey(tenantId, "form payload test key");
    const form = new URLSearchParams({ name: "هند", phone: "0509998877", lead_source: "سناب شات", budget: "500000" });
    const response = await POST(new Request("https://example.test/api/v1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${rawKey}` },
      body: form.toString()
    }) as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    const texts = (await prisma.message.findMany({ where: { conversationId: body.data.conversationId } })).map((message) => message.text).join("\n");
    expect(texts).toContain("• مصدر الليد: سناب شات");
    expect(texts).toContain("• الميزانية: 500000");
  });

  it("shows a Zapier lead as coming from the platform it names (TikTok, Google)", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { getAdSource } = await import("../lib/ad-source");
    const { rawKey } = await generateApiKey(tenantId, "platform source test key");

    const tiktok = await (await POST(jsonRequest("https://example.test/api/v1/conversations", { phone_number: "0501112233", full_name: "ليلى", lead_source: "تيك توك", campaign: "عرض الصيف" }, rawKey))).json();
    expect(await getAdSource(tenantId, tiktok.data.conversationId)).toMatchObject({ platform: "tiktok", headline: "عرض الصيف", matchedBy: "lead_form" });

    const google = await (await POST(jsonRequest("https://example.test/api/v1/conversations", { phone_number: "0501112244", lead_source: "Google Ads" }, rawKey))).json();
    expect(await getAdSource(tenantId, google.data.conversationId)).toMatchObject({ platform: "google", headline: "Google Ads" });

    const plain = await (await POST(jsonRequest("https://example.test/api/v1/conversations", { phone_number: "0501112255", lead_source: "Typeform" }, rawKey))).json();
    expect(await getAdSource(tenantId, plain.data.conversationId)).toBeNull();
  });

  it("lands an API lead in the same thread a WhatsApp message from that phone uses", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { prisma } = await import("../lib/prisma");
    const { storeWhatsAppMessage, whatsappThreadIds } = await import("../lib/whatsapp-inbox");
    const { rawKey } = await generateApiKey(tenantId, "one thread test key");

    const firstResponse = await POST(jsonRequest("https://example.test/api/v1/conversations", { phone_number: "0503334455", full_name: "فيصل" }, rawKey));
    const first = await firstResponse.json();
    expect(first.data.conversationId).toBe(whatsappThreadIds(tenantId, "966503334455").conversationId);

    const again = await (await POST(jsonRequest("https://example.test/api/v1/conversations", { phone_number: "+966 50 333 4455", full_name: "فيصل" }, rawKey))).json();
    expect(again.data.conversationId).toBe(first.data.conversationId);

    const stored = await storeWhatsAppMessage({ phone: "966503334455", name: "فيصل", text: "السلام عليكم", direction: "in", tenantId, messageId: "one-thread-1" });
    expect(stored.conversationId).toBe(first.data.conversationId);
    expect(await prisma.conversation.count({ where: { tenantId, customer: { phone: "966503334455" } } })).toBe(1);
  });

  it("still needs a phone", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { rawKey } = await generateApiKey(tenantId, "no phone test key");
    const response = await POST(jsonRequest("https://example.test/api/v1/conversations", { full_name: "بدون جوال", budget: "1" }, rawKey));
    expect(response.status).toBe(400);
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
