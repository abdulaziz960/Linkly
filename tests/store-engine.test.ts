import { existsSync, unlinkSync } from "fs";
import { createHmac } from "crypto";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-store-engine.db");
const sendTemplate = vi.fn(async (..._args: unknown[]) => ({ ok: true as boolean, error: "" }));
const sendBotText = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("../lib/campaign-engine", () => ({ sendWhatsAppTemplate: (...args: unknown[]) => sendTemplate(...args) }));
vi.mock("../lib/bot-engine", () => ({ sendBotText: (...args: unknown[]) => sendBotText(...args) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("SALLA_WEBHOOK_SECRET", "whsec-test");
});

beforeEach(async () => {
  sendTemplate.mockClear();
  sendBotText.mockClear();
  // The reminder processor reads customers (opt-out), so the full schema has to exist.
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "9001",
  reference_id: "100245",
  status: { slug: "delivering", name: "جاري التوصيل" },
  customer: { first_name: "سارة", last_name: "العتيبي", mobile: "500000111", mobile_code: "+966" },
  total: { amount: 350, currency: "SAR" },
  shipments: [{ tracking_number: "TRK123", tracking_link: "https://track.example/TRK123", courier_name: "سمسا" }],
  ...overrides
});

describe("pure helpers", () => {
  it("maps store statuses to the groups the texts are written for", async () => {
    const { orderStatusGroup } = await import("../lib/store-engine");
    expect(orderStatusGroup("under_review", "قيد المراجعة")).toBe("review");
    expect(orderStatusGroup("in_progress", "قيد التنفيذ")).toBe("processing");
    expect(orderStatusGroup("delivering", "جاري التوصيل")).toBe("shipped");
    expect(orderStatusGroup("shipped", "تم الشحن")).toBe("shipped");
    expect(orderStatusGroup("delivered", "تم التوصيل")).toBe("delivered");
    expect(orderStatusGroup("completed", "مكتمل")).toBe("delivered");
    expect(orderStatusGroup("canceled", "ملغي")).toBe("cancelled");
    expect(orderStatusGroup("weird", "شيء آخر")).toBe("other");
  });

  it("finds an order number and tells a question from small talk", async () => {
    const { extractOrderReference, looksLikeOrderQuestion } = await import("../lib/store-engine");
    expect(extractOrderReference("وين طلبي رقم 100245؟")).toBe("100245");
    expect(extractOrderReference("رقم طلبي ١٠٠٢٤٥")).toBe("100245");
    expect(extractOrderReference("جوالي 0500000111")).toBe("");
    expect(extractOrderReference("وين طلبي")).toBe("");
    expect(looksLikeOrderQuestion("وين طلبي")).toBe(true);
    expect(looksLikeOrderQuestion("ابغى اتتبع شحنتي")).toBe(true);
    expect(looksLikeOrderQuestion("كم سعر الجوال؟")).toBe(false);
  });

  it("matches phones by their last nine digits only", async () => {
    const { samePhone } = await import("../lib/store-engine");
    expect(samePhone("966500000111", "0500000111")).toBe(true);
    expect(samePhone("+966 50 000 0111", "500000111")).toBe(true);
    expect(samePhone("966500000111", "966500000222")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });

  it("renders texts with the order details, leaving out what the order lacks", async () => {
    const { renderOrderText } = await import("../lib/store-engine");
    const { normalizeSallaOrder } = await import("../lib/salla");
    const full = normalizeSallaOrder(order())!;
    expect(renderOrderText("طلبك {{order}} جاري التوصيل{{company}}{{tracking}}{{link}}", full)).toBe("طلبك 100245 جاري التوصيل\nشركة الشحن: سمسا\nرقم التتبع: TRK123\nتتبع الشحنة: https://track.example/TRK123");
    const bare = normalizeSallaOrder(order({ shipments: [] }))!;
    expect(renderOrderText("طلبك {{order}}{{tracking}}", bare)).toBe("طلبك 100245");
  });

  it("holds sending during quiet hours (Riyadh time) and not outside them", async () => {
    const { quietHoursEnd } = await import("../lib/store-engine");
    const quiet = { enabled: true, start: "22:00", end: "08:00" };
    // 23:00 Riyadh = 20:00 UTC
    const night = quietHoursEnd(new Date("2026-10-12T20:00:00Z"), quiet);
    expect(night?.toISOString()).toBe("2026-10-13T05:00:00.000Z"); // 08:00 Riyadh
    expect(quietHoursEnd(new Date("2026-10-12T09:00:00Z"), quiet)).toBeNull(); // 12:00 Riyadh
    expect(quietHoursEnd(new Date("2026-10-12T20:00:00Z"), { ...quiet, enabled: false })).toBeNull();
  });
});

describe("Salla payloads", () => {
  it("normalizes the order and builds the customer phone", async () => {
    const { normalizeSallaOrder, storePhone } = await import("../lib/salla");
    expect(normalizeSallaOrder(order())).toMatchObject({ id: "9001", reference: "100245", customerName: "سارة العتيبي", customerPhone: "966500000111", total: 350, trackingNumber: "TRK123", shippingCompany: "سمسا" });
    expect(normalizeSallaOrder({})).toBeNull();
    expect(storePhone("+966", "0500000111")).toBe("966500000111");
    expect(storePhone("", "0500000111")).toBe("966500000111");
    expect(storePhone("", "12")).toBe("");
  });

  it("parses events and verifies the signature", async () => {
    const { parseSallaWebhook, verifySallaWebhook } = await import("../lib/salla");
    expect(parseSallaWebhook({ event: "order.created", merchant: 77, data: order() })).toMatchObject({ type: "order.created", merchantId: "77", order: { reference: "100245" } });
    expect(parseSallaWebhook({ event: "order.status.updated", merchant: 77, data: { order: order() } })).toMatchObject({ type: "order.status.updated" });
    expect(parseSallaWebhook({ event: "abandoned.cart", merchant: 77, data: { id: 5, customer: { mobile: "500000111", mobile_code: "+966", first_name: "ليلى" }, total: { amount: 120 }, checkout_url: "https://store/cart/5" } })).toMatchObject({ type: "abandoned.cart", cart: { id: "5", customerPhone: "966500000111", total: 120, url: "https://store/cart/5" } });
    expect(parseSallaWebhook({ event: "product.updated", merchant: 77, data: {} })).toMatchObject({ type: "ignored" });

    const body = JSON.stringify({ event: "order.created" });
    const signature = createHmac("sha256", "whsec-test").update(body).digest("hex");
    expect(verifySallaWebhook(body, { signature })).toBe(true);
    expect(verifySallaWebhook(body, { signature: "deadbeef" })).toBe(false);
    expect(verifySallaWebhook(body, { authorization: "Bearer whsec-test" })).toBe(true);
    expect(verifySallaWebhook(body, {})).toBe(false);
    expect(verifySallaWebhook(body, { signature }, "")).toBe(false);
  });
});

async function connect(tenantId: string, merchantId: string) {
  const { saveStoreTokens } = await import("../lib/store-connections");
  await saveStoreTokens({ tenantId, store: "salla", accessToken: "access-token-xyz", refreshToken: "refresh-token-xyz", expiresAt: new Date(Date.now() + 3600_000).toISOString(), merchantId, merchantName: "متجر الاختبار" });
}

describe("order notifications and cart reminders", () => {
  it("sends the notification for a status change once, with the order's variables", async () => {
    await connect("ten-notify", "m-1");
    const { saveStoreSettings } = await import("../lib/store-settings");
    await saveStoreSettings("ten-notify", "salla", { orderNotifications: { shipped: { enabled: true, template: "order_shipped" }, created: { enabled: false, template: "" } } });
    const { handleSallaWebhook } = await import("../lib/store-engine");

    const body = { event: "order.status.updated", merchant: "m-1", data: order() };
    expect(await handleSallaWebhook(body)).toMatchObject({ handled: true, detail: "sent" });
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0].slice(0, 3)).toEqual(["ten-notify", "966500000111", "order_shipped"]);
    expect(sendTemplate.mock.calls[0][8]).toEqual(["سارة العتيبي", "100245", "جاري التوصيل", "https://track.example/TRK123"]);

    expect(await handleSallaWebhook(body)).toMatchObject({ detail: "duplicate" });
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(await handleSallaWebhook({ event: "order.created", merchant: "m-1", data: order() })).toMatchObject({ detail: "off" });
    expect(await handleSallaWebhook({ event: "order.created", merchant: "unknown", data: order() })).toMatchObject({ handled: false, status: 202 });
  });

  it("schedules a cart reminder, waits for it, and a later order cancels the rest", async () => {
    await connect("ten-cart", "m-2");
    const { saveStoreSettings } = await import("../lib/store-settings");
    await saveStoreSettings("ten-cart", "salla", { abandonedCart: { enabled: true, delayMinutes: 10, maxReminders: 2, intervalHours: 1, minCartValue: 50, quietHours: { enabled: false }, discountCode: "BACK10", templates: ["cart_1", "cart_2"], skipIfOrderedDays: 0 } });
    const { handleSallaWebhook, processStoreCartReminders } = await import("../lib/store-engine");
    const { prisma } = await import("../lib/prisma");

    const cart = (id: string, amount: number, mobile: string) => ({ event: "abandoned.cart", merchant: "m-2", data: { id, customer: { first_name: "ليلى", mobile, mobile_code: "+966" }, total: { amount }, checkout_url: `https://store/cart/${id}` } });
    expect(await handleSallaWebhook(cart("c1", 20, "500000333"))).toMatchObject({ detail: "below-minimum" });
    expect(await handleSallaWebhook(cart("c2", 200, "500000444"))).toMatchObject({ detail: "scheduled" });
    expect(await handleSallaWebhook(cart("c2", 200, "500000444"))).toMatchObject({ detail: "duplicate" });

    expect(await processStoreCartReminders("ten-cart")).toBe(0); // not due yet
    await prisma.$executeRawUnsafe(`UPDATE store_cart_reminders SET next_at = '2000-01-01T00:00:00.000Z' WHERE cart_id = 'c2'`);
    expect(await processStoreCartReminders("ten-cart")).toBe(1);
    expect(sendTemplate.mock.calls[0].slice(0, 3)).toEqual(["ten-cart", "966500000444", "cart_1"]);
    expect(sendTemplate.mock.calls[0][8]).toEqual(["ليلى", "200", "https://store/cart/c2", ""]); // no discount on the first reminder

    // The customer then orders: the second reminder never goes out.
    await prisma.$executeRawUnsafe(`UPDATE store_cart_reminders SET next_at = '2000-01-01T00:00:00.000Z' WHERE cart_id = 'c2'`);
    await handleSallaWebhook({ event: "order.created", merchant: "m-2", data: order({ id: "9100", reference_id: "100300", customer: { first_name: "ليلى", mobile: "500000444", mobile_code: "+966" } }) });
    sendTemplate.mockClear();
    expect(await processStoreCartReminders("ten-cart")).toBe(0);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("puts the discount code on the last reminder only", async () => {
    await connect("ten-last", "m-3");
    const { saveStoreSettings } = await import("../lib/store-settings");
    await saveStoreSettings("ten-last", "salla", { abandonedCart: { enabled: true, delayMinutes: 10, maxReminders: 1, quietHours: { enabled: false }, discountCode: "BACK10", templates: ["cart_only"], skipIfOrderedDays: 0 } });
    const { handleSallaWebhook, processStoreCartReminders } = await import("../lib/store-engine");
    const { prisma } = await import("../lib/prisma");
    await handleSallaWebhook({ event: "abandoned.cart", merchant: "m-3", data: { id: "c9", customer: { first_name: "نوف", mobile: "500000555", mobile_code: "+966" }, total: { amount: 80 }, checkout_url: "https://store/cart/c9" } });
    await prisma.$executeRawUnsafe(`UPDATE store_cart_reminders SET next_at = '2000-01-01T00:00:00.000Z' WHERE cart_id = 'c9'`);
    expect(await processStoreCartReminders("ten-last")).toBe(1);
    expect(sendTemplate.mock.calls[0][8]).toEqual(["نوف", "80", "https://store/cart/c9", "BACK10"]);
  });
});

describe("answering 'where is my order' in the chat", () => {
  function mockSalla() {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
      const href = String(url);
      calls.push(href);
      if (href.includes("/orders?reference_id=100245")) return new Response(JSON.stringify({ data: [order({ shipments: [] })] }), { status: 200 });
      if (href.includes("/orders/9001")) return new Response(JSON.stringify({ data: order() }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));
    return calls;
  }

  it("answers with the order's status and tracking when the phone matches", async () => {
    await connect("ten-ask", "m-4");
    const { saveStoreSettings } = await import("../lib/store-settings");
    await saveStoreSettings("ten-ask", "salla", { orderLookup: { enabled: true } });
    mockSalla();
    const { handleOrderInquiry } = await import("../lib/store-engine");

    expect(await handleOrderInquiry({ tenantId: "ten-ask", conversationId: "conv-1", phone: "966500000111", text: "وين طلبي رقم 100245" })).toBe(true);
    const reply = String((sendBotText.mock.calls[0][1] as { text: string }).text);
    expect(reply).toContain("100245");
    expect(reply).toContain("جاري التوصيل");
    expect(reply).toContain("TRK123");
  });

  it("gives the same not-found answer for someone else's order", async () => {
    await connect("ten-ask2", "m-5");
    const { saveStoreSettings, DEFAULT_STORE_SETTINGS } = await import("../lib/store-settings");
    await saveStoreSettings("ten-ask2", "salla", { orderLookup: { enabled: true } });
    mockSalla();
    const { handleOrderInquiry } = await import("../lib/store-engine");
    expect(await handleOrderInquiry({ tenantId: "ten-ask2", conversationId: "conv-2", phone: "966500000999", text: "تتبع طلبي 100245" })).toBe(true);
    const reply = String((sendBotText.mock.calls[0][1] as { text: string }).text);
    expect(reply).toBe(DEFAULT_STORE_SETTINGS.orderLookup.notFoundText);
    expect(reply).not.toContain("TRK123");
  });

  it("asks for the number when there is none, and stays out of the way otherwise", async () => {
    await connect("ten-ask3", "m-6");
    const { saveStoreSettings, DEFAULT_STORE_SETTINGS } = await import("../lib/store-settings");
    await saveStoreSettings("ten-ask3", "salla", { orderLookup: { enabled: true } });
    mockSalla();
    const { handleOrderInquiry } = await import("../lib/store-engine");
    expect(await handleOrderInquiry({ tenantId: "ten-ask3", conversationId: "c3", phone: "966500000111", text: "وين طلبي" })).toBe(true);
    expect((sendBotText.mock.calls[0][1] as { text: string }).text).toBe(DEFAULT_STORE_SETTINGS.orderLookup.askNumberText);
    sendBotText.mockClear();
    expect(await handleOrderInquiry({ tenantId: "ten-ask3", conversationId: "c3", phone: "966500000111", text: "كم سعر المنتج؟" })).toBe(false);
    expect(sendBotText).not.toHaveBeenCalled();
    // Off by default / not connected: never answers.
    expect(await handleOrderInquiry({ tenantId: "ten-none", conversationId: "c4", phone: "966500000111", text: "وين طلبي 100245" })).toBe(false);
  });
});
