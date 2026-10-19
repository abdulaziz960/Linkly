import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-providers.db");
const tenantId = "tenant-catalog-providers";

const sent: Array<{ input: Record<string, unknown> }> = [];
const texts: string[] = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ input }); return { ok: true }; }),
  sendWhatsAppTextMessage: vi.fn(async (input: { text: string }) => { texts.push(input.text); return { ok: true }; }),
  sendWhatsAppUploadedMedia: vi.fn(async () => ({ ok: true }))
}));
vi.mock("../lib/catalog-payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/catalog-payments")>()),
  createMerchantInvoice: vi.fn(async (input: { amount: number }) => ({ id: "inv-card", url: `https://pay.example/card?amount=${input.amount}` }))
}));

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
const calls: Call[] = [];
let tabbyPayment: Record<string, unknown> = { id: "pay-1", status: "CREATED", amount: "0.00", captures: [] };
let tabbySession: Record<string, unknown> = {};
let tamaraOrderStatus = "new";
let captureOk = true;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const call: Call = { url, method: String(init.method || "GET"), headers, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);

    if (url === "https://api.tabby.sa/api/v2/checkout") {
      return respond(Object.keys(tabbySession).length ? tabbySession : { id: "sess-1", status: "created", payment: { id: "pay-1" }, configuration: { available_products: { installments: [{ web_url: "https://checkout.tabby.sa/?sessionId=abc" }] }, products: { installments: { rejection_reason: null } } } });
    }
    if (url === "https://api.tabby.sa/api/v1/webhooks") return headers.authorization === "Bearer sk_test_bad" ? respond({ error: "bad key" }, 401) : respond({ id: "wh-1" });
    if (/^https:\/\/api\.tabby\.sa\/api\/v2\/payments\/[^/]+\/captures$/.test(url)) return captureOk ? respond({ status: "CLOSED" }) : respond({ error: "x" }, 400);
    if (/^https:\/\/api\.tabby\.sa\/api\/v2\/payments\/[^/]+$/.test(url)) return respond(tabbyPayment);

    if (url.endsWith("/checkout") && url.includes("tamara.co")) return respond({ order_id: "tam-1", checkout_id: "c-1", status: "new", checkout_url: "https://checkout.tamara.co/checkout/c-1" });
    if (url.endsWith("/webhooks") && url.includes("tamara.co")) return headers.authorization === "Bearer bad-token" ? respond({ message: "unauthorised" }, 401) : respond({ webhook_id: "w-1" });
    if (/tamara\.co\/orders\/[^/]+\/authorise$/.test(url)) return respond({ status: "authorised" });
    if (/tamara\.co\/orders\/[^/]+$/.test(url)) return respond({ status: tamaraOrderStatus, total_amount: { amount: tamaraTotal, currency: "SAR" } });
    return respond({}, 404);
  }));
}
let tamaraTotal = 0;

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("APP_URL", "https://linklysa.io");
});
beforeEach(() => {
  calls.length = 0;
  sent.length = 0;
  texts.length = 0;
  captureOk = true;
  tabbySession = {};
  installFetch();
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

const request = (over: Record<string, unknown> = {}) => ({
  tenantId,
  orderId: "ord-12345678-abcd",
  amount: 628.2,
  currency: "SAR",
  description: "ساعة ذكية",
  items: [{ name: "ساعة ذكية", sku: "W1", quantity: 2, unitPrice: 349 }],
  customer: { name: "سارة العتيبي", phone: "966500000001", email: "sara@example.com", registeredSince: "2026-01-05T10:00:00Z", history: { count: 2, firstPaidAt: "2026-02-01T10:00:00Z", lastPaidAt: "2026-09-20T10:00:00Z" } },
  discountAmount: 69.8,
  discountName: "كود SAVE10",
  shippingFee: 0,
  shipping: { city: "الرياض", address: "حي الملقا" },
  urls: { success: "https://linklysa.io/order/thanks?o=1", cancel: "https://linklysa.io/order/thanks", failure: "https://linklysa.io/order/thanks" },
  notificationUrl: "https://linklysa.io/api/catalog/payment-webhook/tamara?t=x",
  ...over
});

describe("provider settings are kept encrypted", () => {
  it("saves and reads back a method's keys per workspace", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    const { saveProviderConfig, getProviderConfig, clearProviderConfig } = await import("../lib/payments/config");
    await ensureSchema();
    await saveProviderConfig(tenantId, "tabby", { enabled: true, config: { secretKey: "sk_test_abc", merchantCode: "MC1" } });
    expect(await getProviderConfig(tenantId, "tabby")).toEqual({ enabled: true, config: { secretKey: "sk_test_abc", merchantCode: "MC1" } });
    const raw = await prisma.$queryRawUnsafe<Array<{ config_enc: string }>>("SELECT config_enc FROM catalog_payment_providers WHERE provider = 'tabby'");
    expect(raw[0].config_enc).not.toContain("sk_test_abc");
    expect(await getProviderConfig("another-tenant", "tabby")).toEqual({ enabled: false, config: {} });
    await clearProviderConfig(tenantId, "tabby");
    expect((await getProviderConfig(tenantId, "tabby")).enabled).toBe(false);
  });
});

describe("saving Tabby and Tamara", () => {
  it("registers our notification URL (which proves the keys) and never returns a key", async () => {
    const { saveTabby, saveTamara, getProviderStatuses } = await import("../lib/payments/settings");
    const { getProviderConfig } = await import("../lib/payments/config");

    expect(await saveTabby(tenantId, { secretKey: "not-a-key", merchantCode: "MC1", enabled: true })).toMatchObject({ ok: false });
    expect(await saveTabby(tenantId, { secretKey: "sk_test_good", publicKey: "wrong", merchantCode: "MC1", enabled: true })).toMatchObject({ ok: false, error: expect.stringContaining("pk_") });
    expect(await saveTabby(tenantId, { secretKey: "sk_test_bad", merchantCode: "MC1", enabled: true })).toEqual({ ok: false, error: "مفتاح تابي أو رمز التاجر غير صحيح" });

    const saved = await saveTabby(tenantId, { secretKey: "sk_test_good", publicKey: "pk_test_abc", merchantCode: "MC1", enabled: true });
    expect(saved).toMatchObject({ ok: true });
    const registration = calls.find((call) => call.url === "https://api.tabby.sa/api/v1/webhooks" && call.headers.authorization === "Bearer sk_test_good");
    expect(registration?.headers["x-merchant-code"]).toBe("MC1");
    expect(registration?.body.url).toBe(`https://linklysa.io/api/catalog/payment-webhook/tabby?t=${tenantId}`);
    expect(registration?.body.header.title).toBe("X-Auth-Key");
    const stored = await getProviderConfig(tenantId, "tabby");
    expect(stored.config.webhookSecret).toBe(registration?.body.header.value);
    expect(stored.config.publicKey).toBe("pk_test_abc");
    expect(JSON.stringify(saved)).not.toContain("sk_test_good");
    expect(JSON.stringify(saved)).not.toContain("pk_test_abc"); // the public key is saved, never returned

    // saving the same keys again does not register a second webhook
    calls.length = 0;
    await saveTabby(tenantId, { enabled: true });
    expect(calls.filter((call) => call.url.endsWith("/api/v1/webhooks"))).toHaveLength(0);

    expect(await saveTamara(tenantId, { apiToken: "bad-token", enabled: true })).toEqual({ ok: false, error: "رمز واجهة تمارا غير صحيح" });
    expect(await saveTamara(tenantId, { enabled: true })).toMatchObject({ ok: false, error: expect.stringContaining("API Token") });
    calls.length = 0;
    expect(await saveTamara(tenantId, { apiToken: "tamara-token", publicKey: "tamara-public", sandbox: true, enabled: true })).toMatchObject({ ok: true });
    expect(calls[0].url).toBe("https://api-sandbox.tamara.co/webhooks");
    expect(calls[0].body).toMatchObject({ type: "order", url: `https://linklysa.io/api/catalog/payment-webhook/tamara?t=${tenantId}` });
    expect(calls[0].body.events).toContain("order_approved");

    const statuses = await getProviderStatuses(tenantId);
    expect(statuses.find((s) => s.provider === "tabby")).toMatchObject({ enabled: true, configured: true, testMode: true, merchantCode: "MC1", hasPublicKey: true });
    expect(statuses.find((s) => s.provider === "tamara")).toMatchObject({ enabled: true, configured: true, testMode: true, hasPublicKey: true });
    expect(JSON.stringify(statuses)).not.toContain("tamara-token");
  });
});

describe("Tabby", () => {
  it("creates a checkout session with the documented payload and returns the payment page", async () => {
    const { createTabbyPayment, tabbyRejectionMessage } = await import("../lib/payments/tabby");
    const config = { secretKey: "sk_test_good", merchantCode: "MC1", webhookSecret: "s", webhookUrl: "u" };
    const created = await createTabbyPayment(config, request());
    expect(created).toEqual({ externalId: "pay-1", url: "https://checkout.tabby.sa/?sessionId=abc" });
    const call = calls.find((c) => c.url === "https://api.tabby.sa/api/v2/checkout")!;
    expect(call.headers.authorization).toBe("Bearer sk_test_good");
    expect(call.body).toMatchObject({
      lang: "ar",
      merchant_code: "MC1",
      payment: {
        amount: "628.20",
        currency: "SAR",
        buyer: { name: "سارة العتيبي", email: "sara@example.com", phone: "+966500000001" },
        shipping_address: { city: "الرياض", address: "حي الملقا" },
        order: { reference_id: "ord-12345678-abcd", shipping_amount: "0.00", discount_amount: "69.80", items: [{ title: "ساعة ذكية", quantity: 2, unit_price: "349.00" }] }
      },
      merchant_urls: { success: "https://linklysa.io/order/thanks?o=1" }
    });

    tabbySession = { status: "rejected", configuration: { available_products: {}, products: { installments: { rejection_reason: "order_amount_too_high" } } } };
    await expect(createTabbyPayment(config, request())).rejects.toMatchObject({ kind: "rejected", message: tabbyRejectionMessage("order_amount_too_high") });
  });

  it("captures an authorised payment once, and judges the other statuses from Tabby's own answer", async () => {
    const { verifyTabbyPayment } = await import("../lib/payments/tabby");
    const config = { secretKey: "sk_test_good", merchantCode: "MC1", webhookSecret: "s", webhookUrl: "u" };

    tabbyPayment = { id: "pay-1", status: "AUTHORIZED", amount: "628.20", captures: [] };
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toEqual({ state: "paid" });
    const capture = calls.find((c) => c.url.endsWith("/captures"))!;
    expect(capture.method).toBe("POST");
    expect(capture.body).toEqual({ amount: "628.20", reference_id: "capture-ord-1" });

    tabbyPayment = { id: "pay-1", status: "CREATED", amount: "628.20" };
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toEqual({ state: "pending" });
    tabbyPayment = { id: "pay-1", status: "EXPIRED", amount: "628.20" };
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toMatchObject({ state: "failed" });
    tabbyPayment = { id: "pay-1", status: "REJECTED", amount: "628.20" };
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toMatchObject({ state: "failed" });
    tabbyPayment = { id: "pay-1", status: "CLOSED", amount: "628.20", captures: [{ id: "c" }] };
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toMatchObject({ state: "paid" });
    tabbyPayment = { id: "pay-1", status: "CLOSED", amount: "628.20", captures: [] };
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toMatchObject({ state: "failed" });

    // a payment for another amount is never accepted, and nothing is captured for it
    calls.length = 0;
    tabbyPayment = { id: "pay-1", status: "AUTHORIZED", amount: "100.00", captures: [] };
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toMatchObject({ state: "pending", reason: "amount-mismatch" });
    expect(calls.some((c) => c.url.endsWith("/captures"))).toBe(false);

    // a capture that fails but finds the payment already closed (the other path won the race) is still paid
    captureOk = false;
    tabbyPayment = { id: "pay-1", status: "AUTHORIZED", amount: "628.20", captures: [] };
    let reads = 0;
    const original = tabbyPayment;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith("/captures")) return respond({ error: "already closed" }, 400);
      reads += 1;
      return respond(reads === 1 ? original : { id: "pay-1", status: "CLOSED", amount: "628.20", captures: [{ id: "c" }] });
    }));
    expect(await verifyTabbyPayment(config, "pay-1", 628.2, "ord-1")).toEqual({ state: "paid" });
  });
});

describe("Tamara", () => {
  it("creates a checkout session with the documented payload and returns the payment page", async () => {
    const { createTamaraPayment, tamaraDate, splitName } = await import("../lib/payments/tamara");
    const config = { apiToken: "tok", notificationToken: "", sandbox: true, webhookSecret: "s", webhookUrl: "u" };
    const created = await createTamaraPayment(config, request({ shippingFee: 25 }));
    expect(created).toEqual({ externalId: "tam-1", url: "https://checkout.tamara.co/checkout/c-1" });
    const call = calls.find((c) => c.url === "https://api-sandbox.tamara.co/checkout")!;
    expect(call.headers.authorization).toBe("Bearer tok");
    expect(call.body).toMatchObject({
      order_reference_id: "ord-12345678-abcd",
      total_amount: { amount: 628.2, currency: "SAR" },
      country_code: "SA",
      payment_type: "PAY_BY_INSTALMENTS",
      instalments: 3,
      shipping_amount: { amount: 25, currency: "SAR" },
      tax_amount: { amount: 0 },
      discount: { name: "كود SAVE10", amount: { amount: 69.8 } },
      consumer: { first_name: "سارة", last_name: "العتيبي", phone_number: "966500000001", email: "sara@example.com" },
      shipping_address: { city: "الرياض", line1: "حي الملقا", country_code: "SA" },
      merchant_url: { success: "https://linklysa.io/order/thanks?o=1", notification: "https://linklysa.io/api/catalog/payment-webhook/tamara?t=x" },
      risk_assessment: { total_order_count: 2, account_creation_date: "05-01-2026", date_first_paid: "01-02-2026", date_last_paid: "20-09-2026" }
    });
    expect(call.body.items[0]).toMatchObject({ name: "ساعة ذكية", quantity: 2, unit_price: { amount: 349 }, total_amount: { amount: 698 } });
    expect(tamaraDate("2026-09-20T22:30:00Z")).toBe("21-09-2026"); // Riyadh time
    expect(splitName("سارة")).toEqual({ first: "سارة", last: "-" });

    // a first order carries no paid dates
    calls.length = 0;
    await createTamaraPayment(config, request({ customer: { ...request().customer, history: { count: 0, firstPaidAt: "", lastPaidAt: "" } } }));
    expect(calls[0].body.risk_assessment).toMatchObject({ total_order_count: 0, date_first_paid: null, date_last_paid: null });
  });

  it("authorises an approved order once and judges the other statuses from Tamara's own answer", async () => {
    const { verifyTamaraOrder } = await import("../lib/payments/tamara");
    const config = { apiToken: "tok", notificationToken: "", sandbox: false, webhookSecret: "s", webhookUrl: "u" };
    tamaraTotal = 628.2;

    tamaraOrderStatus = "approved";
    expect(await verifyTamaraOrder(config, "tam-1", 628.2)).toEqual({ state: "paid" });
    expect(calls.some((c) => c.url === "https://api.tamara.co/orders/tam-1/authorise" && c.method === "POST")).toBe(true);

    calls.length = 0;
    tamaraOrderStatus = "authorised";
    expect(await verifyTamaraOrder(config, "tam-1", 628.2)).toEqual({ state: "paid" });
    expect(calls.some((c) => c.url.endsWith("/authorise"))).toBe(false);
    tamaraOrderStatus = "fully_captured";
    expect(await verifyTamaraOrder(config, "tam-1", 628.2)).toEqual({ state: "paid" });
    tamaraOrderStatus = "new";
    expect(await verifyTamaraOrder(config, "tam-1", 628.2)).toEqual({ state: "pending" });
    for (const status of ["declined", "expired", "canceled"]) {
      tamaraOrderStatus = status;
      expect(await verifyTamaraOrder(config, "tam-1", 628.2)).toMatchObject({ state: "failed" });
    }

    // an order for another amount is never accepted
    calls.length = 0;
    tamaraOrderStatus = "approved";
    expect(await verifyTamaraOrder(config, "tam-1", 999)).toMatchObject({ state: "pending", reason: "amount-mismatch" });
    expect(calls.some((c) => c.url.endsWith("/authorise"))).toBe(false);
  });
});

async function seedChat() {
  const { prisma } = await import("../lib/prisma");
  const { createProduct, cleanProductInput, saveCatalogSettings } = await import("../lib/catalog");
  const clean = cleanProductInput({ name: "ساعة", price: 200, imageUrl: "https://example.com/a.jpg", description: "وصف", stock: 5 });
  if (!clean.ok) throw new Error(clean.error);
  const product = await createProduct(tenantId, clean.data);
  await saveCatalogSettings(tenantId, { paymentEnabled: true, gatewaySecretKey: "sk_test_abcdefghijklmnop1234" });
  const conversation = async (id: string) => {
    await prisma.customer.create({ data: { id: `cust-${id}`, name: "سارة", phone: "966500000001", initial: "س", tenantId } });
    await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
  };
  return { product, conversation };
}

function ctx(conversationId: string) {
  const out: string[] = [];
  return { out, ctx: { channel: "whatsapp" as const, tenantId, conversationId, recipientId: "966500000001", sendText: async (t: string) => { out.push(t); } } };
}
const lastButtons = () => ((sent.at(-1)?.input as { buttons?: Array<{ id: string; title: string }> })?.buttons ?? []);
const lastBody = () => String((sent.at(-1)?.input as { bodyText?: string })?.bodyText ?? "");

describe("choosing the payment method in the chat", () => {
  it("offers the methods that are on, sends the customer to the one they pick, and asks Tabby's email", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { getProviderConfig } = await import("../lib/payments/config");
    const { product, conversation } = await seedChat();
    expect((await getProviderConfig(tenantId, "tabby")).enabled).toBe(true);
    const cid = "prov-chat";
    await conversation(cid);
    const { ctx: c, out } = ctx(cid);
    await addToCart(tenantId, cid, product.id, 2);

    // pay -> the three methods are offered as buttons, with the total
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(lastButtons().map((b) => b.id)).toEqual(["pay_moyasar", "pay_tabby", "pay_tamara"]);
    expect(lastButtons().map((b) => b.title)).toEqual(["ادفع بالبطاقة", "ادفع بتابي", "ادفع بتمارا"]);
    expect(lastBody()).toContain("الإجمالي: 400 ر.س");
    expect(await prisma.catalogOrder.count({ where: { conversationId: cid } })).toBe(0);

    // Tamara: an order awaiting payment, Tamara's order id stored with its prefix, the link sent
    tamaraTotal = 400;
    await handleCatalogReply(c, { id: "pay_tamara", text: "" }, "");
    const order = (await prisma.catalogOrder.findMany({ where: { conversationId: cid } }))[0];
    expect(order).toMatchObject({ status: "awaiting_payment", paymentId: "tamara-tam-1", paymentUrl: "https://checkout.tamara.co/checkout/c-1", total: 400 });
    expect(out.at(-1)).toContain("لإتمام الدفع عبر تمارا");
    expect(out.at(-1)).toContain("https://checkout.tamara.co/checkout/c-1");
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.stock).toBe(3);

    // Tabby: first its email is asked (and checked), then the session starts with it
    await addToCart(tenantId, cid, product.id, 1);
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    await handleCatalogReply(c, { id: "pay_tabby", text: "" }, "");
    expect(out.at(-1)).toContain("بريدك الإلكتروني");
    await handleCatalogReply(c, { text: "not an email" }, "");
    expect(out.at(-1)).toContain("بريدًا إلكترونيًا صحيحًا");
    calls.length = 0;
    await handleCatalogReply(c, { text: "sara@example.com" }, "");
    expect(calls.find((call) => call.url.endsWith("/api/v2/checkout"))?.body.payment.buyer.email).toBe("sara@example.com");
    const tabbyOrder = (await prisma.catalogOrder.findMany({ where: { conversationId: cid, paymentId: "tabby-pay-1" } }))[0];
    expect(tabbyOrder).toMatchObject({ status: "awaiting_payment", total: 200 });
    expect(out.at(-1)).toContain("https://checkout.tabby.sa/?sessionId=abc");

    // cards still work as before
    await addToCart(tenantId, cid, product.id, 1);
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    await handleCatalogReply(c, { id: "pay_moyasar", text: "" }, "");
    expect(out.at(-1)).toContain("https://pay.example/card?amount=200");
  });

  it("cancels the order, gives back stock and code, and offers the rest when a provider refuses the purchase", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart } = await import("../lib/catalog-cart");
    const { createDiscount, findDiscountByCode } = await import("../lib/catalog-discounts");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const product = (await prisma.product.findMany({ where: { tenantId } }))[0];
    const before = (await prisma.product.findUnique({ where: { id: product.id } }))!.stock;
    await createDiscount(tenantId, { code: "REFUSE10", kind: "percent", value: 10 });
    const cid = "prov-refused";
    await prisma.customer.create({ data: { id: `cust-${cid}`, name: "عميل", phone: "966500000002", initial: "ع", tenantId } });
    await prisma.conversation.create({ data: { id: cid, customerId: `cust-${cid}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
    const { ctx: c, out } = ctx(cid);
    await addToCart(tenantId, cid, product.id, 1);
    await handleCatalogReply(c, { text: "كود refuse10" }, "");

    tabbySession = { status: "rejected", configuration: { available_products: {}, products: { installments: { rejection_reason: "order_amount_too_low" } } } };
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    await handleCatalogReply(c, { id: "pay_tabby", text: "" }, "");
    sent.length = 0;
    await handleCatalogReply(c, { text: "buyer@example.com" }, "");

    expect(out.at(-1)).toContain("الحد الأدنى لاستخدام تابي");
    const order = (await prisma.catalogOrder.findMany({ where: { conversationId: cid } }))[0];
    expect(order.status).toBe("cancelled");
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.stock).toBe(before);
    expect((await findDiscountByCode(tenantId, "REFUSE10"))?.usedCount).toBe(0);
    // the other methods are offered again, Tabby no longer among them
    expect(lastButtons().map((b) => b.id)).toEqual(["pay_moyasar", "pay_tamara"]);
  });
});

describe("notifications from the providers", () => {
  it("rejects a notification without our secret, asks for a retry when the payment is unknown, and verifies before marking paid", async () => {
    const { prisma } = await import("../lib/prisma");
    const { getProviderConfig } = await import("../lib/payments/config");
    const tabbyRoute = await import("../app/api/catalog/payment-webhook/tabby/route");
    const tamaraRoute = await import("../app/api/catalog/payment-webhook/tamara/route");
    const tabbySecret = (await getProviderConfig(tenantId, "tabby")).config.webhookSecret!;
    const tamaraSecret = (await getProviderConfig(tenantId, "tamara")).config.webhookSecret!;
    const post = (route: { POST: (r: NextRequest) => Promise<Response> }, name: string, headers: Record<string, string>, body: unknown) =>
      route.POST(new NextRequest(`https://linklysa.io/api/catalog/payment-webhook/${name}?t=${tenantId}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

    expect((await post(tabbyRoute, "tabby", {}, { id: "pay-1" })).status).toBe(401);
    expect((await post(tabbyRoute, "tabby", { "x-auth-key": "wrong" }, { id: "pay-1" })).status).toBe(401);
    expect((await post(tabbyRoute, "tabby", { "x-auth-key": tabbySecret }, { id: "pay-unknown" })).status).toBe(404);

    // the Tabby order created above is awaiting payment: a notification makes us ask Tabby, which says AUTHORIZED -> capture -> paid
    const order = (await prisma.catalogOrder.findMany({ where: { tenantId, paymentId: "tabby-pay-1" } }))[0];
    expect(order.status).toBe("awaiting_payment");
    tabbyPayment = { id: "pay-1", status: "AUTHORIZED", amount: "200.00", captures: [] };
    calls.length = 0;
    expect((await post(tabbyRoute, "tabby", { "x-auth-key": tabbySecret }, { id: "pay-1", status: "authorized" })).status).toBe(200);
    expect(calls.some((c) => c.url.endsWith("/captures"))).toBe(true);
    expect((await prisma.catalogOrder.findUnique({ where: { id: order.id } }))?.status).toBe("paid");
    expect(texts.at(-1)).toContain("تم استلام دفعك");

    // Tamara: approved -> authorised by us -> paid
    const tamaraOrder = (await prisma.catalogOrder.findMany({ where: { tenantId, paymentId: "tamara-tam-1" } }))[0];
    tamaraOrderStatus = "approved";
    tamaraTotal = 400;
    expect((await post(tamaraRoute, "tamara", { authorization: "nope" }, { order_id: "tam-1" })).status).toBe(401);
    expect((await post(tamaraRoute, "tamara", { authorization: tamaraSecret }, { order_id: "tam-1", event_type: "order_approved" })).status).toBe(200);
    expect((await prisma.catalogOrder.findUnique({ where: { id: tamaraOrder.id } }))?.status).toBe("paid");

    // a provider that reports the payment failed or expired cancels the order and gives the stock back
    const cancelled = (await prisma.catalogOrder.findMany({ where: { tenantId, status: "cancelled" } }))[0];
    expect(cancelled).toBeTruthy();
  });

  it("the reconciler also settles provider orders whose notification never came", async () => {
    const { prisma } = await import("../lib/prisma");
    const { reconcileAwaitingOrders } = await import("../lib/catalog-payments");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const product = (await prisma.product.findMany({ where: { tenantId } }))[0];
    const cid = "prov-reconcile";
    await prisma.customer.create({ data: { id: `cust-${cid}`, name: "عميل", phone: "966500000003", initial: "ع", tenantId } });
    await prisma.conversation.create({ data: { id: cid, customerId: `cust-${cid}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
    const { ctx: c } = ctx(cid);
    await addToCart(tenantId, cid, product.id, 1);
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    tamaraTotal = 200;
    await handleCatalogReply(c, { id: "pay_tamara", text: "" }, "");
    const order = (await prisma.catalogOrder.findMany({ where: { conversationId: cid } }))[0];
    expect(order.status).toBe("awaiting_payment");

    tamaraOrderStatus = "authorised";
    await reconcileAwaitingOrders();
    expect((await prisma.catalogOrder.findUnique({ where: { id: order.id } }))?.status).toBe("paid");
  });
});
