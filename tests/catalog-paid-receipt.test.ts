import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-paid-receipt.db");
const tenantId = "tenant-paid-receipt";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("paid catalog order", () => {
  it("sends the text confirmation and then the receipt PDF, once", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { saveCatalogSettings } = await import("../lib/catalog");
    const { processOrderPaymentCallback } = await import("../lib/catalog-payments");
    await ensureSchema();

    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "pnid-rc", wabaId: "waba-rc",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("tok"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    await saveCatalogSettings(tenantId, { paymentEnabled: true, gatewaySecretKey: "sk_test_abcdefghijklmnop1234" });
    await prisma.customer.create({ data: { id: "cust-rc", name: "سارة العتيبي", phone: "966500001111", initial: "س", tenantId } });
    await prisma.conversation.create({ data: { id: "conv-rc", customerId: "cust-rc", channel: "whatsapp", lastMessage: "", status: "closed", assignee: "بدون موظف", tenantId } });
    // an inbound message keeps the 24h window open
    await prisma.message.create({ data: { id: "wa-in-rc", conversationId: "conv-rc", direction: "in", text: "أبغى أشتري", time: "10:00", createdAt: new Date().toISOString(), author: "سارة" } });
    await prisma.catalogOrder.create({
      data: {
        id: "ord-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", tenantId, conversationId: "conv-rc", customerName: "سارة العتيبي", customerPhone: "966500001111",
        productId: "p1", productName: "ساعة ذكية", unitPrice: 349, quantity: 1, total: 349, currency: "SAR",
        status: "awaiting_payment", paymentId: "inv-1", paymentUrl: "https://pay.test/inv-1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }
    });

    const sent: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const target = String(url);
      if (target.includes("api.moyasar.com/v1/invoices/inv-1")) {
        return new Response(JSON.stringify({ id: "inv-1", status: "paid", amount: 34900, metadata: { order_id: "ord-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } }));
      }
      sent.push({ url: target, body: init.body instanceof FormData ? "form" : JSON.parse(String(init.body)) });
      if (target.endsWith("/media")) return new Response(JSON.stringify({ id: "doc-rc" }));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }));
    }));

    const first = await processOrderPaymentCallback("ord-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(first.body.status).toBe("paid");

    const messages = sent.filter((call) => call.url.endsWith("/messages")).map((call) => call.body);
    expect(messages[0]).toMatchObject({ type: "text" });
    expect(messages[0].text.body).toContain("ORD-AAAAAAAA");
    expect(messages[1]).toMatchObject({ type: "document", document: { id: "doc-rc", filename: "receipt-ORD-AAAAAAAA.pdf" } });

    // a second delivery of the same callback sends nothing more
    const before = sent.length;
    await processOrderPaymentCallback("ord-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(sent.length).toBe(before);
  }, 30_000);
});
