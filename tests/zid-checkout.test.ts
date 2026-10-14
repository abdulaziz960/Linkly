import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-zid-checkout.db");
const tenantId = "tenant-zid-checkout";

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

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "مالك", email: "o@b.sa", tenantId: "tenant-zid-checkout", role: "مالك الحساب" }))
}));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));

describe("Zid order body", () => {
  it("splits Saudi phones and builds the documented body", async () => {
    const { splitPhone, buildZidOrderBody } = await import("../lib/zid-checkout");
    expect(splitPhone("966500000111")).toEqual({ code: "966", number: "500000111" });
    expect(splitPhone("0500000111")).toEqual({ code: "966", number: "500000111" });
    expect(splitPhone("+966 50 000 0111")).toEqual({ code: "966", number: "500000111" });

    const body = buildZidOrderBody({ customerName: "سارة", phone: "966500000111", city: "الرياض", addressLine: "حي الملقا", sku: "SKU1", quantity: 2, shippingMethodId: 432480, paymentMethodId: 555224, linkValidHours: 24 }, new Date("2026-10-14T00:00:00.000Z")) as Record<string, any>;
    expect(body).toMatchObject({
      currency_code: "SAR",
      coupon_code: null,
      products: [{ sku: "SKU1", quantity: 2 }],
      shipping_method: { type: "delivery", id: 432480 },
      payment_method: { id: 555224, payment_link_configs: { expiryDateTime: "2026-10-15T00:00:00.000Z" } },
      created_by: "api"
    });
    expect(body.customer).toMatchObject({ full_name: "سارة", mobile_country_code: "966", mobile_number: "500000111" });
    expect(body.consignee.address).toMatchObject({ line_1: "حي الملقا", city_name: "الرياض", country_code: "SA" });
  });
});

describe("buying from the WhatsApp catalog in a Zid store", () => {
  async function seed() {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { saveStoreTokens } = await import("../lib/store-connections");
    const { packZidToken } = await import("../lib/zid");
    const { saveStoreSettings } = await import("../lib/store-settings");
    await ensureSchema();
    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "pnid-zc", wabaId: "waba-zc",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("tok"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    await saveStoreTokens({ tenantId, store: "zid", accessToken: packZidToken({ manager: "m", authorization: "a" }), refreshToken: "", expiresAt: new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString(), merchantId: "store-1", merchantName: "متجر" });
    await saveStoreSettings(tenantId, "zid", { checkout: { enabled: true, shippingMethodId: 432480, paymentMethodId: 555224, linkValidHours: 24 } });
    const now = new Date().toISOString();
    const base = { tenantId, description: "", price: 349, currency: "SAR", imageUrl: "", productUrl: "", category: "", stock: -1, active: 1, createdAt: now, updatedAt: now };
    await prisma.product.create({ data: { ...base, id: "p-zid", source: "api", externalId: "zid-1", name: "ساعة ذكية", sku: "SKU1" } });
    await prisma.product.create({ data: { ...base, id: "p-manual", source: "manual", externalId: "", name: "منتج يدوي", sku: "" } });
    await prisma.customer.create({ data: { id: "cust-zc", name: "سارة العتيبي", phone: "966500000111", initial: "س", tenantId } });
    await prisma.conversation.create({ data: { id: "conv-zc", customerId: "cust-zc", channel: "whatsapp", lastMessage: "", status: "closed", assignee: "بدون موظف", tenantId } });
    await prisma.message.create({ data: { id: "wa-in-zc", conversationId: "conv-zc", direction: "in", text: "أبغى أشتري", time: "10:00", createdAt: now, author: "سارة" } });
  }

  it("asks the address, creates the order in Zid, sends its payment link, and confirms when Zid says paid", async () => {
    await seed();
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { processOrderPaymentCallback } = await import("../lib/catalog-payments");
    const { prisma } = await import("../lib/prisma");

    const sentText: string[] = [];
    const ctx = { channel: "whatsapp" as const, tenantId, conversationId: "conv-zc", recipientId: "966500000111", sendText: async (text: string) => { sentText.push(text); } };
    const zidCalls: Array<{ url: string; method: string; body: any }> = [];
    const meta: Array<{ url: string; body: any }> = [];
    let zidPaid = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const target = String(url);
      if (target.includes("api.zid.sa")) {
        zidCalls.push({ url: target, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : null });
        if (target.endsWith("/managers/store/drafts")) return new Response(JSON.stringify({ status: "success", order: { id: 9001, code: "100777", payment_link: "https://pay.zid.test/abc" } }));
        if (target.includes("/managers/store/orders/9001/view")) return new Response(JSON.stringify({ order: { id: 9001, payment_status: { code: zidPaid ? "paid" : "pending" } } }));
        return new Response("{}", { status: 404 });
      }
      meta.push({ url: target, body: init.body instanceof FormData ? "form" : JSON.parse(String(init.body)) });
      if (target.endsWith("/media")) return new Response(JSON.stringify({ id: "doc-zc" }));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${meta.length}` }] }));
    }));

    // 1) tap "buy": the city is asked first, and nothing is created yet
    expect(await handleCatalogReply(ctx, { id: "buy_p-zid", text: "" }, "")).toBe("handled");
    expect(sentText.at(-1)).toContain("مدينتك");
    expect(zidCalls).toHaveLength(0);

    // 2) the city, then the address
    expect(await handleCatalogReply(ctx, { text: "الرياض" }, "")).toBe("handled");
    expect(sentText.at(-1)).toContain("عنوانك");
    expect(await handleCatalogReply(ctx, { text: "حي الملقا، شارع التخصصي، مبنى 12" }, "")).toBe("handled");

    // 3) the order exists in Zid, built from the documented body, and the customer got Zid's payment link
    const create = zidCalls.find((call) => call.url.endsWith("/managers/store/drafts"));
    expect(create?.method).toBe("POST");
    expect(create?.body).toMatchObject({ products: [{ sku: "SKU1", quantity: 1 }], shipping_method: { type: "delivery", id: 432480 }, payment_method: { id: 555224 } });
    expect(create?.body.consignee.address).toMatchObject({ city_name: "الرياض", line_1: "حي الملقا، شارع التخصصي، مبنى 12" });
    expect(sentText.at(-1)).toContain("https://pay.zid.test/abc");
    expect(sentText.at(-1)).toContain("100777");

    const order = await prisma.catalogOrder.findFirst({ where: { tenantId, conversationId: "conv-zc" } });
    expect(order).toMatchObject({ status: "awaiting_payment", paymentId: "zid-9001", paymentUrl: "https://pay.zid.test/abc" });
    // no Moyasar anywhere
    expect(zidCalls.concat().every((call) => !call.url.includes("moyasar"))).toBe(true);

    // 4) not paid yet: a payment-status event changes nothing; once Zid says paid the customer is confirmed
    await processOrderPaymentCallback(order!.id);
    expect((await prisma.catalogOrder.findUnique({ where: { id: order!.id } }))?.status).toBe("awaiting_payment");
    zidPaid = true;
    await processOrderPaymentCallback(order!.id);
    expect((await prisma.catalogOrder.findUnique({ where: { id: order!.id } }))?.status).toBe("paid");
    const sends = meta.filter((call) => call.url.endsWith("/messages")).map((call) => call.body);
    expect(sends[0].text.body).toContain("تم استلام دفعك");
    expect(sends[1]).toMatchObject({ type: "document" });
  }, 30_000);

  it("never uses the merchant's own gateway: a hand-added product goes to a person", async () => {
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { saveCatalogSettings } = await import("../lib/catalog");
    const { prisma } = await import("../lib/prisma");
    // a gateway key saved before the store was connected must be ignored from now on
    await saveCatalogSettings(tenantId, { paymentEnabled: true, gatewaySecretKey: "sk_test_abcdefghijklmnop1234" });

    const sentText: string[] = [];
    const ctx = { channel: "whatsapp" as const, tenantId, conversationId: "conv-zc", recipientId: "966500000111", sendText: async (text: string) => { sentText.push(text); } };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await prisma.conversation.update({ where: { id: "conv-zc" }, data: { status: "closed" } });
    expect(await handleCatalogReply(ctx, { id: "buy_p-manual", text: "" }, "")).toBe("handled");
    expect(sentText.at(-1)).toContain("سيتواصل معك أحد موظفينا");
    expect(sentText.at(-1)).not.toContain("moyasar");
    expect(fetchMock.mock.calls.some((call) => String((call as unknown[])[0]).includes("moyasar"))).toBe(false);
    const row = await prisma.catalogOrder.findFirst({ where: { tenantId, productId: "p-manual" } });
    expect(row).toMatchObject({ status: "new", paymentId: "" });
  });

  it("refuses to set up a gateway or a product feed while Zid is connected", async () => {
    const { PUT, GET } = await import("../app/api/catalog/settings/route");
    const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/catalog/settings", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

    expect((await put({ gatewaySecretKey: "sk_test_abcdefghijklmnop5678" })).status).toBe(409);
    expect((await put({ paymentEnabled: true })).status).toBe(409);
    expect((await put({ feedUrl: "https://example.com/feed.xml" })).status).toBe(409);
    expect((await put({ feedUrl: "" })).status).toBe(200); // clearing is allowed

    const settings = await (await GET()).json();
    expect(settings.data).toMatchObject({ zidConnected: true, zidCheckoutReady: true });
  });
});
