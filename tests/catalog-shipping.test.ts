import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-shipping.db");
const tenantId = "tenant-catalog-shipping";

const sent: Array<{ input: Record<string, unknown> }> = [];
const invoices: Array<{ amount: number }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ input }); return { ok: true }; })
}));
vi.mock("../lib/catalog-payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/catalog-payments")>()),
  createMerchantInvoice: vi.fn(async (input: { amount: number }) => { invoices.push({ amount: input.amount }); return { id: `inv-${invoices.length}`, url: `https://pay.example/inv-${invoices.length}` }; })
}));

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

describe("city names", () => {
  it("meet across the usual spellings", async () => {
    const { normalizeCity, parseCitiesText } = await import("../lib/catalog-shipping");
    expect(normalizeCity("الرياض")).toBe(normalizeCity("رياض"));
    expect(normalizeCity("جدة")).toBe(normalizeCity("جده"));
    expect(normalizeCity("أبها")).toBe(normalizeCity("ابها"));
    expect(normalizeCity("  Jeddah ")).toBe(normalizeCity("jeddah"));
    expect(normalizeCity("المدينة المنورة")).toBe(normalizeCity("مدينة منورة"));
    expect(parseCitiesText("الرياض\nجدة، الدمام,  الرياض \n\nرياض")).toEqual(["الرياض", "جدة", "الدمام"]);
  });
});

describe("delivery options", () => {
  it("validates, saves per workspace, and finds the options for a city", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { cleanShippingInput, createShippingMethod, listShippingMethods, updateShippingMethod, deleteShippingMethod, methodsForCity, servedCities, shippingFee } = await import("../lib/catalog-shipping");
    await ensureSchema();
    expect(cleanShippingInput({ name: "س", price: 10, cities: "" })).toMatchObject({ ok: false });
    expect(cleanShippingInput({ name: "سمسا", price: -1, cities: "" })).toMatchObject({ ok: false });
    expect(cleanShippingInput({ name: "سمسا", price: "25", freeOver: "300", eta: " 2-3 أيام ", cities: "الرياض\nجدة" })).toMatchObject({ ok: true, data: { name: "سمسا", price: 25, freeOver: 300, eta: "2-3 أيام", cities: ["الرياض", "جدة"] } });

    const smsa = await createShippingMethod("tenant-other-ship", { name: "أرامكس", price: 5, cities: "" });
    expect(smsa).toMatchObject({ ok: true });
    const a = await createShippingMethod(tenantId, { name: "سمسا", price: 25, freeOver: 300, eta: "2-3 أيام", cities: "الرياض\nجدة" });
    const b = await createShippingMethod(tenantId, { name: "توصيل المحل", price: 15, cities: "الرياض" });
    if (!a.ok || !b.ok) throw new Error("create failed");
    expect(await listShippingMethods(tenantId)).toHaveLength(2);

    const methods = await listShippingMethods(tenantId);
    expect(methodsForCity(methods, "رياض").map((m) => m.name)).toEqual(["سمسا", "توصيل المحل"]);
    expect(methodsForCity(methods, "جده").map((m) => m.name)).toEqual(["سمسا"]);
    expect(methodsForCity(methods, "تبوك")).toEqual([]);
    expect(servedCities(methods)).toEqual(["الرياض", "جدة"]);
    expect(servedCities([...methods, { ...methods[0], id: "x", cities: [] }])).toBeNull();

    expect(shippingFee(a.method, 200)).toBe(25);
    expect(shippingFee(a.method, 300)).toBe(0); // free over the threshold

    // an option switched off is not offered; switching it back needs no other field
    expect(await updateShippingMethod(tenantId, b.method.id, { active: false })).toMatchObject({ ok: true, method: { active: false, name: "توصيل المحل", price: 15 } });
    expect(methodsForCity(await listShippingMethods(tenantId), "الرياض").map((m) => m.name)).toEqual(["سمسا"]);
    expect(await updateShippingMethod(tenantId, b.method.id, { active: true })).toMatchObject({ ok: true });
    expect(await updateShippingMethod("tenant-other-ship", a.method.id, { active: false })).toMatchObject({ ok: false });
    expect(await updateShippingMethod(tenantId, a.method.id, { name: "سمسا إكسبرس", price: 30, cities: "الرياض" })).toMatchObject({ ok: true, method: { name: "سمسا إكسبرس", price: 30, cities: ["الرياض"] } });
    // restore for the chat tests below
    await updateShippingMethod(tenantId, a.method.id, { name: "سمسا", price: 25, freeOver: 300, eta: "2-3 أيام", cities: "الرياض\nجدة" });
    expect(await deleteShippingMethod("tenant-other-ship", a.method.id)).toBe(false);
  });
});

async function seed() {
  const { prisma } = await import("../lib/prisma");
  const { createProduct, cleanProductInput, saveCatalogSettings } = await import("../lib/catalog");
  const clean = cleanProductInput({ name: "ساعة", price: 200, imageUrl: "https://example.com/a.jpg", description: "وصف" });
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
  const texts: string[] = [];
  return { texts, ctx: { channel: "whatsapp" as const, tenantId, conversationId, recipientId: "966500000001", sendText: async (t: string) => { texts.push(t); } } };
}

const lastBody = () => String((sent.at(-1)?.input as { bodyText?: string })?.bodyText ?? "");
const lastButtons = () => ((sent.at(-1)?.input as { buttons?: Array<{ id: string; title: string }> })?.buttons ?? []);

describe("delivery questions in the chat checkout", () => {
  it("asks the city, offers the options, takes the address, shows the fee, and charges products plus delivery", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { listOrders } = await import("../lib/catalog");
    const { product, conversation } = await seed();
    const cid = "ship-chat";
    await conversation(cid);
    const { ctx: c, texts } = ctx(cid);
    await addToCart(tenantId, cid, product.id, 1);

    // pay -> the city is asked first, with the cities served
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(texts.at(-1)).toContain("ما اسم *مدينتك*");
    expect(texts.at(-1)).toContain("الرياض، جدة");
    expect(invoices).toHaveLength(0);

    // a city nobody serves
    await handleCatalogReply(c, { text: "تبوك" }, "");
    expect(texts.at(-1)).toContain("لا يتوفر التوصيل إلى «تبوك»");
    expect(texts.at(-1)).toContain("المدن المتاحة");

    // Riyadh has two options: buttons with the name, price and time in the message
    sent.length = 0;
    await handleCatalogReply(c, { text: "رياض" }, "");
    expect(lastBody()).toContain("سمسا: 25 ر.س (2-3 أيام)");
    expect(lastBody()).toContain("توصيل المحل: 15 ر.س");
    expect(lastButtons().map((b) => b.title)).toEqual(["سمسا", "توصيل المحل"]);

    // choosing one asks the address; a too-short address is refused
    const smsaId = lastButtons()[0].id;
    await handleCatalogReply(c, { id: smsaId, text: "" }, "");
    expect(texts.at(-1)).toContain("سنوصل طلبك إلى رياض عبر سمسا: 25 ر.س");
    await handleCatalogReply(c, { text: "حي" }, "");
    expect(texts.at(-1)).toContain("اكتب العنوان بالتفصيل");

    // the summary: products, delivery fee, total, address, and the confirm / edit buttons
    sent.length = 0;
    await handleCatalogReply(c, { text: "حي الملقا، شارع التخصصي، مبنى 12" }, "");
    expect(lastBody()).toContain("ملخص الطلب");
    expect(lastBody()).toContain("التوصيل (سمسا - رياض): 25 ر.س");
    expect(lastBody()).toContain("الإجمالي: 225 ر.س");
    expect(lastBody()).toContain("العنوان: حي الملقا، شارع التخصصي، مبنى 12");
    expect(lastButtons().map((b) => b.id)).toEqual(["ship_confirm", "ship_edit"]);

    // confirm: the payment link carries products + delivery, and the order remembers where it goes
    await handleCatalogReply(c, { id: "ship_confirm", text: "" }, "");
    expect(invoices).toEqual([{ amount: 225 }]);
    expect(texts.at(-1)).toContain("https://pay.example/inv-1");
    expect(texts.at(-1)).toContain("الإجمالي: 225 ر.س");
    const order = (await prisma.catalogOrder.findMany({ where: { conversationId: cid } }))[0];
    expect(order).toMatchObject({ total: 225, status: "awaiting_payment" });
    expect((await listOrders(tenantId)).find((item) => item.id === order.id)?.shipping).toEqual({ methodName: "سمسا", city: "رياض", address: "حي الملقا، شارع التخصصي، مبنى 12", fee: 25, eta: "2-3 أيام" });
    const note = await prisma.message.findFirst({ where: { conversationId: cid, direction: "note" } });
    expect(note?.text).toContain("التوصيل: سمسا إلى رياض");

    // the cart is empty and no question is pending
    texts.length = 0;
    await handleCatalogReply(c, { text: "السلة" }, "");
    expect(texts.join("\n")).toContain("سلتك فارغة");
  });

  it("skips the choice when one option serves the city, ships free over the threshold, and works with a discount code", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart } = await import("../lib/catalog-cart");
    const { createDiscount } = await import("../lib/catalog-discounts");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const product = (await prisma.product.findMany({ where: { tenantId } }))[0];
    await createDiscount(tenantId, { code: "TEN", kind: "percent", value: 10 });
    const cid = "ship-free";
    await prisma.customer.create({ data: { id: `cust-${cid}`, name: "عميل", phone: "966500000004", initial: "ع", tenantId } });
    await prisma.conversation.create({ data: { id: cid, customerId: `cust-${cid}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
    const { ctx: c, texts } = ctx(cid);
    await addToCart(tenantId, cid, product.id, 2); // 400, above the 300 free threshold of سمسا
    await handleCatalogReply(c, { text: "كود ten" }, "");

    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    await handleCatalogReply(c, { text: "جدة" }, ""); // only سمسا serves Jeddah
    expect(texts.at(-1)).toContain("سنوصل طلبك إلى جدة عبر سمسا: مجاني");
    sent.length = 0;
    invoices.length = 0;
    await handleCatalogReply(c, { text: "حي الروضة، شارع فلسطين 4" }, "");
    // 400 - 10% = 360 products, still above 300: delivery is free
    expect(lastBody()).toContain("الخصم (TEN): -40 ر.س");
    expect(lastBody()).toContain("التوصيل (سمسا - جدة): مجاني");
    expect(lastBody()).toContain("الإجمالي: 360 ر.س");
    await handleCatalogReply(c, { text: "تأكيد" }, "");
    expect(invoices).toEqual([{ amount: 360 }]);
  });

  it("can be cancelled, edited, abandoned by tapping something else, and follows a change in the options", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart } = await import("../lib/catalog-cart");
    const { listShippingMethods, updateShippingMethod } = await import("../lib/catalog-shipping");
    const { getCheckoutFlow } = await import("../lib/catalog-checkout-flow");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const product = (await prisma.product.findMany({ where: { tenantId } }))[0];
    const make = async (id: string) => {
      await prisma.customer.create({ data: { id: `cust-${id}`, name: "عميل", phone: "966500000005", initial: "ع", tenantId } });
      await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
      await addToCart(tenantId, id, product.id, 1);
    };

    // cancel at the city question goes back to the cart
    await make("ship-cancel");
    const a = ctx("ship-cancel");
    await handleCatalogReply(a.ctx, { id: "cart_pay", text: "" }, "");
    sent.length = 0;
    await handleCatalogReply(a.ctx, { text: "إلغاء" }, "");
    expect(lastBody()).toContain("سلتك");
    expect(await getCheckoutFlow("ship-cancel")).toBeNull();

    // "edit the address" restarts from the city
    await make("ship-edit");
    const b = ctx("ship-edit");
    await handleCatalogReply(b.ctx, { id: "cart_pay", text: "" }, "");
    await handleCatalogReply(b.ctx, { text: "جدة" }, "");
    await handleCatalogReply(b.ctx, { text: "حي الروضة، شارع فلسطين 4" }, "");
    await handleCatalogReply(b.ctx, { id: "ship_edit", text: "" }, "");
    expect(b.texts.at(-1)).toContain("ما اسم *مدينتك*");
    expect((await getCheckoutFlow("ship-edit"))?.step).toBe("city");

    // tapping "all products" while a question is pending abandons the checkout
    await handleCatalogReply(b.ctx, { id: "cat_back", text: "" }, "");
    expect(await getCheckoutFlow("ship-edit")).toBeNull();

    // the option chosen is switched off before the customer confirms: the options are asked again, nothing is charged
    await make("ship-changed");
    const d = ctx("ship-changed");
    await handleCatalogReply(d.ctx, { id: "cart_pay", text: "" }, "");
    await handleCatalogReply(d.ctx, { text: "جدة" }, "");
    await handleCatalogReply(d.ctx, { text: "حي الروضة، شارع فلسطين 4" }, "");
    const methods = await listShippingMethods(tenantId);
    const smsa = methods.find((m) => m.name === "سمسا")!;
    await updateShippingMethod(tenantId, smsa.id, { active: false });
    invoices.length = 0;
    await handleCatalogReply(d.ctx, { text: "تأكيد" }, "");
    expect(invoices).toHaveLength(0);
    expect(d.texts.join("\n")).toContain("تغيّرت خيارات التوصيل");
    await updateShippingMethod(tenantId, smsa.id, { active: true });
  });

  it("is not asked at all when no delivery option exists", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart } = await import("../lib/catalog-cart");
    const { listShippingMethods, deleteShippingMethod } = await import("../lib/catalog-shipping");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    for (const method of await listShippingMethods(tenantId)) await deleteShippingMethod(tenantId, method.id);
    const product = (await prisma.product.findMany({ where: { tenantId } }))[0];
    const cid = "ship-none";
    await prisma.customer.create({ data: { id: `cust-${cid}`, name: "عميل", phone: "966500000006", initial: "ع", tenantId } });
    await prisma.conversation.create({ data: { id: cid, customerId: `cust-${cid}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
    await addToCart(tenantId, cid, product.id, 1);
    const { ctx: c, texts } = ctx(cid);
    invoices.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(invoices).toEqual([{ amount: 200 }]);
    expect(texts.at(-1)).not.toContain("التوصيل");
  });
});

describe("after payment", () => {
  it("names the delivery in the confirmation message", async () => {
    const { buildPaidOrderMessage } = await import("../lib/catalog-payments");
    const message = buildPaidOrderMessage(
      { id: "ord-abcdef123456", customerName: "سارة", customerPhone: "966500000001", productName: "ساعة", quantity: 1, total: 225, currency: "SAR" },
      new Date().toISOString(), "", undefined, undefined, { methodName: "سمسا", city: "الرياض", address: "حي الملقا", fee: 25, eta: "" }
    );
    expect(message).toContain("التوصيل: سمسا إلى الرياض");
    expect(message).toContain("رسوم التوصيل: 25 ر.س");
    expect(message).toContain("المبلغ المدفوع: 225 ر.س");
  });
});
