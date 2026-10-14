import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-zid.db");
const sendTemplate = vi.fn(async (..._args: unknown[]) => ({ ok: true as boolean, error: "" }));
const sendBotText = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("../lib/campaign-engine", () => ({ sendWhatsAppTemplate: (...args: unknown[]) => sendTemplate(...args) }));
vi.mock("../lib/bot-engine", () => ({ sendBotText: (...args: unknown[]) => sendBotText(...args) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("ZID_CLIENT_ID", "zid-client");
  vi.stubEnv("ZID_CLIENT_SECRET", "zid-secret");
});

beforeEach(async () => {
  sendTemplate.mockClear();
  sendBotText.mockClear();
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
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

const zidOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 7001,
  code: "100245",
  order_status: { code: "indelivery", name: "جاري التوصيل" },
  customer: { name: "سارة العتيبي", mobile: "0500000111", email: "a@b.sa" },
  order_total: 350,
  currency_code: "SAR",
  shipping: { method: { name: "سمسا" }, tracking: { number: "TRK1", url: "https://track.example/TRK1" } },
  ...overrides
});

describe("Zid status mapping", () => {
  it("reads Zid's 'indelivery' as shipped, not delivered", async () => {
    const { orderStatusGroup } = await import("../lib/store-engine");
    expect(orderStatusGroup("indelivery", "جاري التوصيل")).toBe("shipped");
    expect(orderStatusGroup("delivered", "تم التوصيل")).toBe("delivered");
    expect(orderStatusGroup("preparing", "قيد التجهيز")).toBe("processing");
    expect(orderStatusGroup("cancelled", "ملغي")).toBe("cancelled");
    expect(orderStatusGroup("new", "جديد")).toBe("other");
  });
});

describe("Zid normalising and trust", () => {
  it("normalises an order, whether wrapped or at the top level", async () => {
    const { normalizeZidOrder } = await import("../lib/zid");
    const expected = { id: "7001", reference: "100245", statusSlug: "indelivery", customerPhone: "966500000111", total: 350, currency: "SAR", trackingNumber: "TRK1", trackingUrl: "https://track.example/TRK1", shippingCompany: "سمسا" };
    expect(normalizeZidOrder(zidOrder())).toMatchObject(expected);
    expect(normalizeZidOrder({ order: zidOrder() })).toMatchObject(expected);
    expect(normalizeZidOrder({ nothing: true })).toBeNull();
  });

  it("normalises an abandoned cart", async () => {
    const { normalizeZidCart } = await import("../lib/zid");
    expect(normalizeZidCart({ id: "c1", customer: { name: "ليلى", mobile: "500000333" }, cart_total: 200, currency_code: "SAR", url: "https://store/c/c1" }))
      .toMatchObject({ id: "c1", customerName: "ليلى", customerPhone: "966500000333", total: 200, url: "https://store/c/c1" });
  });

  it("binds the workspace and event into the callback URL signature", async () => {
    const { zidWebhookUrl, verifyZidWebhook, signZidWebhook } = await import("../lib/zid");
    const url = new URL(zidWebhookUrl("https://linklysa.io", "ten-1", "order.create"));
    expect(url.pathname).toBe("/api/zid/webhook");
    const signature = url.searchParams.get("s") || "";
    expect(verifyZidWebhook("ten-1", "order.create", signature)).toBe(true);
    expect(verifyZidWebhook("ten-2", "order.create", signature)).toBe(false);
    expect(verifyZidWebhook("ten-1", "order.status.update", signature)).toBe(false);
    expect(signature).toBe(signZidWebhook("ten-1", "order.create"));
  });

  it("keeps both Zid tokens in one value", async () => {
    const { packZidToken, unpackZidToken, authorizationHeader } = await import("../lib/zid");
    expect(unpackZidToken(packZidToken({ manager: "m-token", authorization: "a-token" }))).toEqual({ manager: "m-token", authorization: "a-token" });
    expect(unpackZidToken("not json")).toBeNull();
    expect(authorizationHeader("abc")).toBe("Bearer abc");
    expect(authorizationHeader("Bearer abc")).toBe("Bearer abc");
  });
});

describe("Zid webhook end to end", () => {
  async function connect(tenantId: string) {
    const { saveStoreTokens } = await import("../lib/store-connections");
    const { packZidToken } = await import("../lib/zid");
    await saveStoreTokens({ tenantId, store: "zid", accessToken: packZidToken({ manager: "m", authorization: "a" }), refreshToken: "r", expiresAt: new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString(), merchantId: "store-1", merchantName: "متجر" });
  }

  it("rejects an unsigned or wrongly signed delivery", async () => {
    const { POST } = await import("../app/api/zid/webhook/route");
    const call = (query: string) => POST(new NextRequest(`http://localhost/api/zid/webhook?${query}`, { method: "POST", body: "{}" }));
    expect((await call("t=ten-1&e=order.create&s=bad")).status).toBe(401);
    expect((await call("t=ten-1&e=unknown.event&s=bad")).status).toBe(401);
  });

  it("re-reads the order through the API, sends the notification once and reports no-phone safely", async () => {
    await connect("ten-zid");
    const { saveStoreSettings } = await import("../lib/store-settings");
    await saveStoreSettings("ten-zid", "zid", { orderNotifications: { shipped: { enabled: true, template: "order_shipped" }, created: { enabled: false, template: "" } } });
    const { zidWebhookUrl } = await import("../lib/zid");
    const { POST } = await import("../app/api/zid/webhook/route");

    const requested: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      requested.push({ url: String(url), headers: (init.headers || {}) as Record<string, string> });
      if (String(url).includes("/managers/store/orders/7001/view")) return new Response(JSON.stringify({ order: zidOrder() }));
      return new Response("{}", { status: 404 });
    }));

    const signed = new URL(zidWebhookUrl("https://linklysa.io", "ten-zid", "order.status.update"));
    const deliver = (body: unknown) => POST(new NextRequest(`http://localhost/api/zid/webhook${signed.search}`, { method: "POST", body: JSON.stringify(body) }));

    // the delivery itself carries only the order id and a status: everything else comes from the API
    const first = await deliver({ id: 7001, order_status: { code: "indelivery" } });
    expect(await first.json()).toMatchObject({ ok: true, detail: "sent" });
    expect(requested[0].headers["X-Manager-Token"]).toBe("m");
    expect(requested[0].headers.Authorization).toBe("Bearer a");
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0].slice(0, 3)).toEqual(["ten-zid", "966500000111", "order_shipped"]);
    expect(sendTemplate.mock.calls[0][8]).toEqual(["سارة العتيبي", "100245", "جاري التوصيل", "https://track.example/TRK1"]);

    expect(await (await deliver({ id: 7001 })).json()).toMatchObject({ detail: "duplicate" });
    expect(sendTemplate).toHaveBeenCalledTimes(1);
  });

  it("answers 'where is my order' for a Zid store", async () => {
    await connect("ten-zid-ask");
    const { saveStoreSettings } = await import("../lib/store-settings");
    await saveStoreSettings("ten-zid-ask", "zid", { orderLookup: { enabled: true } });
    const { handleOrderInquiry } = await import("../lib/store-engine");

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const href = String(url);
      if (href.includes("/managers/store/orders/7001/view")) return new Response(JSON.stringify({ order: zidOrder() }));
      if (href.includes("/managers/store/orders")) return new Response(JSON.stringify({ orders: [zidOrder()] }));
      return new Response("{}", { status: 404 });
    }));

    const handled = await handleOrderInquiry({ tenantId: "ten-zid-ask", conversationId: "conv-z", phone: "966500000111", text: "وين طلبي رقم 100245" });
    expect(handled).toBe(true);
    expect(sendBotText).toHaveBeenCalledTimes(1);
    const text = String((sendBotText.mock.calls[0][1] as { text: string }).text);
    expect(text).toContain("100245");
  });
});

describe("Zid products into the catalog", () => {
  it("maps a Zid product (localized name, sale price, images, unlimited stock) to a catalog record", async () => {
    const { zidProductToRecord } = await import("../lib/zid");
    expect(zidProductToRecord({
      id: "p-1", name: { ar: "ساعة ذكية", en: "Smart watch" }, price: 400, sale_price: 349, quantity: null, sku: "SW-1",
      images: [{ image: { full_size: "https://img/x.jpg" } }], categories: [{ name: { ar: "إلكترونيات" } }], html_url: "https://store.zid.store/products/sw"
    })).toMatchObject({ id: "zid-p-1", name: "ساعة ذكية", price: "349", image_link: "https://img/x.jpg", quantity: -1, category: "إلكترونيات", link: "https://store.zid.store/products/sw", status: "active" });
    expect(zidProductToRecord({ name: "no id" })).toBeNull();
    expect(zidProductToRecord({ id: 2, name: "مخفي", price: 10, quantity: 0, is_published: false })).toMatchObject({ quantity: 0, status: "inactive" });
  });

  it("syncs a paged product list, then hides only Zid products that disappeared", async () => {
    const tenantId = "ten-zid-products";
    const { saveStoreTokens } = await import("../lib/store-connections");
    const { packZidToken } = await import("../lib/zid");
    await saveStoreTokens({ tenantId, store: "zid", accessToken: packZidToken({ manager: "m", authorization: "a" }), refreshToken: "r", expiresAt: new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString(), merchantId: "s1", merchantName: "متجر" });
    const { syncZidProducts, getZidProductSyncStatus } = await import("../lib/zid-products");
    const { prisma } = await import("../lib/prisma");

    const makePage = (ids: number[]) => ({ results: ids.map((id) => ({ id, name: { ar: `منتج ${id}` }, price: 10 + id, quantity: 5 })) });
    let pages: Array<ReturnType<typeof makePage>> = [makePage(Array.from({ length: 50 }, (_, index) => index + 1)), makePage([51, 52])];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const match = /[?&]page=(\d+)/.exec(String(url));
      const body = pages[Number(match?.[1] ?? 1) - 1] ?? { results: [] };
      return new Response(JSON.stringify(body));
    }));

    // a product that came from elsewhere must never be touched by the Zid sync
    await prisma.product.create({ data: { id: "other-1", tenantId, source: "api", externalId: "erp-1", name: "من نظام آخر", description: "", price: 5, currency: "SAR", imageUrl: "", productUrl: "", category: "", sku: "", stock: -1, active: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });

    const first = await syncZidProducts(tenantId);
    expect(first).toMatchObject({ ok: true, created: 52, deactivated: 0 });
    expect((await getZidProductSyncStatus(tenantId)).status).toBe("ok");

    pages = [makePage(Array.from({ length: 49 }, (_, index) => index + 1))];
    const second = await syncZidProducts(tenantId);
    expect(second).toMatchObject({ ok: true, created: 0, deactivated: 3 });
    expect((await prisma.product.findUnique({ where: { id: "other-1" } }))?.active).toBe(1);
  }, 30_000);

  it("reports a permission problem clearly when Zid refuses the product list", async () => {
    const tenantId = "ten-zid-products-denied";
    const { saveStoreTokens } = await import("../lib/store-connections");
    const { packZidToken } = await import("../lib/zid");
    await saveStoreTokens({ tenantId, store: "zid", accessToken: packZidToken({ manager: "m", authorization: "a" }), refreshToken: "", expiresAt: new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString(), merchantId: "s2", merchantName: "متجر" });
    const { syncZidProducts } = await import("../lib/zid-products");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const result = await syncZidProducts(tenantId);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("صلاحية المنتجات");
  });
});

describe("Zid unique coupons", () => {
  it("creates a coupon and falls back to fewer fields when Zid refuses the richest body", async () => {
    const tenantId = "ten-zid-coupon";
    const { saveStoreTokens } = await import("../lib/store-connections");
    const { packZidToken, createZidCoupon, uniqueCouponCode } = await import("../lib/zid");
    await saveStoreTokens({ tenantId, store: "zid", accessToken: packZidToken({ manager: "m", authorization: "a" }), refreshToken: "", expiresAt: new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString(), merchantId: "s3", merchantName: "متجر" });

    expect(uniqueCouponCode()).toMatch(/^LK-[A-Z2-9]{6}$/);

    const bodies: string[][] = [];
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      call += 1;
      bodies.push([...(init.body as FormData).keys()]);
      return new Response("{}", { status: call < 2 ? 422 : 200 });
    }));
    const coupon = await createZidCoupon(tenantId, { code: "LK-TEST22", percent: 15, validHours: 48 });
    expect(coupon).toEqual({ code: "LK-TEST22", limited: false });
    expect(bodies[0]).toEqual(expect.arrayContaining(["name", "code", "discount_type", "discount", "date_end", "max_total"]));
    expect(bodies[1]).not.toContain("max_total");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await createZidCoupon(tenantId, { code: "LK-TEST33", percent: 10, validHours: 24 })).toBeNull();
  });

  it("puts the unique code on the last reminder, and keeps the shared code when Zid refuses", async () => {
    const tenantId = "ten-zid-coupon-flow";
    const { saveStoreTokens } = await import("../lib/store-connections");
    const { packZidToken } = await import("../lib/zid");
    await saveStoreTokens({ tenantId, store: "zid", accessToken: packZidToken({ manager: "m", authorization: "a" }), refreshToken: "", expiresAt: new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString(), merchantId: "s4", merchantName: "متجر" });
    const { saveStoreSettings } = await import("../lib/store-settings");
    await saveStoreSettings(tenantId, "zid", { abandonedCart: { enabled: true, delayMinutes: 10, maxReminders: 1, quietHours: { enabled: false }, discountCode: "SHARED10", uniqueCoupon: { enabled: true, percent: 12, validHours: 24 }, templates: ["cart_1", "", ""] } });
    const { applyStoreEvent, processStoreCartReminders } = await import("../lib/store-engine");
    const { prisma } = await import("../lib/prisma");

    const cart = (id: string, phone: string) => ({ type: "abandoned.cart" as const, merchantId: "s4", cart: { id, customerName: "نوف", customerPhone: phone, total: 120, currency: "SAR", url: `https://store/c/${id}` } });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await applyStoreEvent(tenantId, "zid", cart("zc1", "966500000901"));
    await prisma.$executeRawUnsafe(`UPDATE store_cart_reminders SET next_at = '2000-01-01T00:00:00.000Z' WHERE cart_id = 'zc1'`);
    await processStoreCartReminders(tenantId);
    const unique = String((sendTemplate.mock.calls.at(-1)?.[8] as string[])[3]);
    expect(unique).toMatch(/^LK-[A-Z2-9]{6}$/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await applyStoreEvent(tenantId, "zid", cart("zc2", "966500000902"));
    await prisma.$executeRawUnsafe(`UPDATE store_cart_reminders SET next_at = '2000-01-01T00:00:00.000Z' WHERE cart_id = 'zc2'`);
    await processStoreCartReminders(tenantId);
    expect((sendTemplate.mock.calls.at(-1)?.[8] as string[])[3]).toBe("SHARED10");
  }, 30_000);
});
