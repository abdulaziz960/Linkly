import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-cart.db");
const tenantId = "tenant-catalog-cart";

const sent: Array<{ kind: "buttons" | "cta"; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "cta", input }); return { ok: true }; })
}));
vi.mock("../lib/catalog-payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/catalog-payments")>()),
  createMerchantInvoice: vi.fn(async (input: { amount: number }) => ({ id: "inv-1", url: `https://pay.example/inv-1?amount=${input.amount}` }))
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wait", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedProducts() {
  const { ensureSchema } = await import("../lib/database");
  const { createProduct, cleanProductInput } = await import("../lib/catalog");
  await ensureSchema();
  const make = async (name: string, price: number, stock: number) => {
    const clean = cleanProductInput({ name, price, imageUrl: "https://example.com/a.jpg", description: "وصف", stock });
    if (!clean.ok) throw new Error(clean.error);
    return createProduct(tenantId, clean.data);
  };
  return { tea: await make("شاي", 20, -1), coffee: await make("قهوة", 35.5, 5), gone: await make("منتج منتهٍ", 10, -1) };
}

async function seedConversation(id: string) {
  const { prisma } = await import("../lib/prisma");
  await prisma.customer.create({ data: { id: `cust-${id}`, name: "سارة", phone: "966500000001", initial: "س", tenantId } });
  await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
}

function ctx(conversationId: string) {
  const texts: string[] = [];
  return { texts, ctx: { channel: "whatsapp" as const, tenantId, conversationId, recipientId: "966500000001", sendText: async (t: string) => { texts.push(t); } } };
}

describe("the cart", () => {
  it("merges the same product, caps at tracked stock, edits lines and totals with current prices", async () => {
    const { tea, coffee } = await seedProducts();
    const { addToCart, getCart, resolveCart, setLineQuantity, removeLine, clearCart, formatCart } = await import("../lib/catalog-cart");
    const cid = "cart-unit";

    expect(await addToCart(tenantId, cid, tea.id, 2)).toMatchObject({ ok: true, quantity: 2 });
    expect(await addToCart(tenantId, cid, tea.id, 3)).toMatchObject({ ok: true, quantity: 5 });
    // coffee has 5 in stock: asking for 9 is trimmed to 5 and says so
    expect(await addToCart(tenantId, cid, coffee.id, 9)).toMatchObject({ ok: true, quantity: 5, capped: true });

    expect((await getCart(cid)).lines).toHaveLength(2);
    const resolved = await resolveCart(tenantId, cid);
    expect(resolved.units).toBe(10);
    expect(resolved.total).toBe(5 * 20 + 5 * 35.5);
    const text = formatCart(resolved);
    expect(text).toContain("1️⃣ *شاي*");
    expect(text).toContain("الكمية: 5");
    expect(text).toContain("سعر القطعة: 20 ر.س");
    expect(text).toContain("المجموع: 100 ر.س");
    expect(text).toContain("2️⃣ *قهوة*");
    expect(text).toContain("المجموع: 177.50 ر.س");
    expect(text).toContain("الإجمالي: 277.50 ر.س");

    expect(await setLineQuantity(tenantId, cid, 1, 3)).toBe(true);
    expect((await resolveCart(tenantId, cid)).lines[0].quantity).toBe(3);
    expect(await removeLine(tenantId, cid, 2)).toBe(true);
    expect((await getCart(cid)).lines).toHaveLength(1);
    expect(await removeLine(tenantId, cid, 9)).toBe(false);
    await clearCart(cid);
    expect((await getCart(cid)).lines).toHaveLength(0);
  });

  it("drops a product that is no longer available and refuses to add one that is not", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart, resolveCart } = await import("../lib/catalog-cart");
    const products = await prisma.product.findMany({ where: { tenantId, name: "منتج منتهٍ" } });
    const gone = products[0];
    const cid = "cart-drop";
    expect(await addToCart(tenantId, cid, gone.id, 1)).toMatchObject({ ok: true });
    await prisma.product.update({ where: { id: gone.id }, data: { active: 0 } });
    const resolved = await resolveCart(tenantId, cid);
    expect(resolved.lines).toHaveLength(0);
    expect(resolved.dropped).toEqual(["منتج منتهٍ"]);
    expect(await addToCart(tenantId, cid, gone.id, 1)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("the cart in the chat", () => {
  it("asks the quantity, shows the cart with quantities and the total, then pays once for everything", async () => {
    const { prisma } = await import("../lib/prisma");
    const { saveCatalogSettings, getOrderItems } = await import("../lib/catalog");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const tea = (await prisma.product.findMany({ where: { tenantId, name: "شاي" } }))[0];
    const coffee = (await prisma.product.findMany({ where: { tenantId, name: "قهوة" } }))[0];
    const cid = "cart-chat";
    await seedConversation(cid);
    const { ctx: c, texts } = ctx(cid);

    // add to cart -> asked how many (buttons 1-3), then 2 chosen
    sent.length = 0;
    await handleCatalogReply(c, { id: `cartadd_${tea.id}`, text: "" }, "");
    const ask = sent[0].input as { bodyText: string; buttons: Array<{ id: string; title: string }> };
    expect(ask.bodyText).toContain("كم قطعة");
    expect(ask.buttons.map((b) => b.id)).toEqual(["cartqty_1", "cartqty_2", "cartqty_3"]);

    sent.length = 0;
    await handleCatalogReply(c, { id: "cartqty_2", text: "" }, "");
    const shown = sent[0].input as { bodyText: string; buttons: Array<{ id: string }> };
    expect(shown.bodyText).toContain("*شاي*");
    expect(shown.bodyText).toContain("الكمية: 2");
    expect(shown.bodyText).toContain("الإجمالي: 40 ر.س");
    expect(shown.buttons.map((b) => b.id)).toEqual(["cart_pay", "cat_back", "cart_clear"]);

    // a second product, quantity typed as a number (not taken as a product pick)
    await handleCatalogReply(c, { id: `cartadd_${coffee.id}`, text: "" }, "");
    sent.length = 0;
    await handleCatalogReply(c, { text: "3" }, "");
    const second = (sent[0].input as { bodyText: string }).bodyText;
    expect(second).toContain("*شاي*");
    expect(second).toContain("*قهوة*");
    expect(second).toContain("الكمية: 3");
    expect(second).toContain("الإجمالي: 146.50 ر.س");
    expect(second).not.toContain("✅ تمت إضافة «شاي»"); // the added product is the coffee

    // edit and delete by text
    sent.length = 0;
    await handleCatalogReply(c, { text: "تعديل 1 4" }, "");
    expect((sent[0].input as { bodyText: string }).bodyText).toContain("الكمية: 4");
    sent.length = 0;
    await handleCatalogReply(c, { text: "حذف 2" }, "");
    expect((sent[0].input as { bodyText: string }).bodyText).not.toContain("قهوة");

    // pay with a payment gateway on: one order, one link for the total
    await saveCatalogSettings(tenantId, { paymentEnabled: true, gatewaySecretKey: "sk_test_abcdefghijklmnop1234" });
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    const reply = texts.at(-1) ?? "";
    expect(reply).toContain("*شاي*");
    expect(reply).toContain("الكمية: 4 — 80 ر.س");
    expect(reply).toContain("الإجمالي: 80 ر.س");
    expect(reply).toContain("https://pay.example/inv-1");

    const orders = await prisma.catalogOrder.findMany({ where: { conversationId: cid } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ status: "awaiting_payment", quantity: 4, total: 80, paymentId: "inv-1" });
    expect((await getOrderItems([orders[0].id])).get(orders[0].id)).toEqual([{ productId: tea.id, productName: "شاي", unitPrice: 20, quantity: 4 }]);

    // the cart is empty afterwards
    texts.length = 0;
    await handleCatalogReply(c, { text: "السلة" }, "");
    expect(texts.join("\n")).toContain("سلتك فارغة");
  });

  it("takes the stock of every line at checkout and gives it back, line by line, when the order is cancelled", async () => {
    const { prisma } = await import("../lib/prisma");
    const { updateOrderStatus } = await import("../lib/catalog");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const tea = (await prisma.product.findMany({ where: { tenantId, name: "شاي" } }))[0];
    const coffee = (await prisma.product.findMany({ where: { tenantId, name: "قهوة" } }))[0];
    const cid = "cart-stock";
    await seedConversation(cid);
    const { ctx: c } = ctx(cid);
    await addToCart(tenantId, cid, tea.id, 1);
    await addToCart(tenantId, cid, coffee.id, 2);

    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect((await prisma.product.findUnique({ where: { id: coffee.id } }))?.stock).toBe(3);

    const order = (await prisma.catalogOrder.findMany({ where: { conversationId: cid } }))[0];
    expect(await updateOrderStatus(tenantId, order.id, "cancelled")).toBe(true);
    expect((await prisma.product.findUnique({ where: { id: coffee.id } }))?.stock).toBe(5);
  });

  it("shows the cart again, with the new quantity, instead of charging for fewer units than the customer asked for", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const coffee = (await prisma.product.findMany({ where: { tenantId, name: "قهوة" } }))[0];
    const cid = "cart-short";
    await seedConversation(cid);
    const { ctx: c } = ctx(cid);
    await addToCart(tenantId, cid, coffee.id, 4);
    // someone else buys most of the coffee meanwhile
    await prisma.product.update({ where: { id: coffee.id }, data: { stock: 2 } });

    sent.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    const shown = (sent[0].input as { bodyText: string }).bodyText;
    expect(shown).toContain("تغيّرت الكمية المتاحة");
    expect(shown).toContain("قهوة: من 4 إلى 2");
    expect(shown).toContain("الكمية: 2");
    expect(await prisma.catalogOrder.count({ where: { conversationId: cid } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: coffee.id } }))?.stock).toBe(2);
  });

  it("gives back what was already taken when a later line cannot be covered", async () => {
    const { prisma } = await import("../lib/prisma");
    const { reserveCartStock } = await import("../lib/catalog");
    const { createProduct, cleanProductInput } = await import("../lib/catalog");
    const make = async (name: string, stock: number) => {
      const clean = cleanProductInput({ name, price: 5, imageUrl: "https://example.com/a.jpg", description: "وصف", stock });
      if (!clean.ok) throw new Error(clean.error);
      return createProduct(tenantId, clean.data);
    };
    const a = await make("منتج أ", 5);
    const b = await make("منتج ب", 4);
    await prisma.product.update({ where: { id: b.id }, data: { stock: 2 } }); // b was 4 when the cart was read
    const result = await reserveCartStock(tenantId, [{ product: a, quantity: 2 }, { product: b, quantity: 4 }]);
    expect(result).toEqual({ ok: false, productName: "منتج ب" });
    expect((await prisma.product.findUnique({ where: { id: a.id } }))?.stock).toBe(5);
    expect((await prisma.product.findUnique({ where: { id: b.id } }))?.stock).toBe(2);
  });
});

describe("how the cart reads", () => {
  it("puts big prices in groups of three and keeps a brand name apart from the numbers", async () => {
    const { formatMoney, formatCart } = await import("../lib/catalog-cart");
    expect(formatMoney(439130)).toBe("439,130 ر.س");
    expect(formatMoney(87826.5)).toBe("87,826.50 ر.س");
    const product = { id: "p", name: "ميتسوبيشي - MITSUBISHI اوتلاندر 2026", price: 87826, currency: "SAR" } as never;
    const text = formatCart({ lines: [{ product, quantity: 5, lineTotal: 439130 }], total: 439130, currency: "SAR", units: 5, dropped: [], adjusted: [] });
    const lines = text.split("\n");
    // the name has a line to itself; quantity and amounts are on short lines of their own
    expect(lines.some((line) => line.includes("*ميتسوبيشي - MITSUBISHI اوتلاندر 2026*") && !/\d{3}/.test(line.replace("2026", "")))).toBe(true);
    expect(text).toContain("الكمية: 5");
    expect(text).toContain("سعر القطعة: 87,826 ر.س");
    expect(text).toContain("المجموع: 439,130 ر.س");
    expect(text).toContain("الإجمالي: 439,130 ر.س");
    // every line starts right-to-left so a Latin brand cannot flip it
    expect(lines.filter((line) => line.includes("الكمية")).every((line) => line.startsWith("\u200f"))).toBe(true);
  });

  it("falls back to one short line per product when the cart is too long for one message", async () => {
    const { formatCart, CART_DETAILED_MAX_CHARS } = await import("../lib/catalog-cart");
    const lines = Array.from({ length: 12 }, (_, i) => ({ product: { id: `p${i}`, name: `منتج رقم ${i + 1} باسم طويل جدًا لاختبار الطول`, price: 1000, currency: "SAR" } as never, quantity: 2, lineTotal: 2000 }));
    const cart = { lines, total: 24000, currency: "SAR", units: 24, dropped: [], adjusted: [] };
    expect(formatCart(cart).length).toBeGreaterThan(CART_DETAILED_MAX_CHARS);
    const compact = formatCart(cart, { compact: true });
    expect(compact.length).toBeLessThan(CART_DETAILED_MAX_CHARS + 300);
    expect(compact).toContain("×2 — 2,000 ر.س");
  });
});

describe("a cart order after payment", () => {
  it("lists every product in the paid message and in the receipt rows", async () => {
    const { buildPaidOrderMessage } = await import("../lib/catalog-payments");
    const { receiptItemRows } = await import("../lib/order-receipt");
    const items = [{ productName: "شاي", quantity: 4, unitPrice: 20 }, { productName: "قهوة", quantity: 1, unitPrice: 35.5 }];
    const message = buildPaidOrderMessage({ id: "ord-abcdef123456", customerName: "سارة", customerPhone: "966500000001", productName: "شاي، قهوة", quantity: 5, total: 115.5, currency: "SAR" }, new Date().toISOString(), "", items);
    expect(message).toContain("المنتجات:");
    expect(message).toContain("• شاي\n\u200f   الكمية: 4");
    expect(message).toContain("• قهوة\n\u200f   الكمية: 1");
    expect(message).not.toContain("المنتج: ");

    const rows = receiptItemRows(items.map((item) => ({ name: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })), "SAR");
    expect(rows).toEqual([["شاي × 4", "80 ر.س"], ["قهوة × 1", "35.50 ر.س"]]);
    const many = receiptItemRows(Array.from({ length: 10 }, (_, i) => ({ name: `م${i}`, quantity: 1, unitPrice: 1 })), "SAR");
    expect(many).toHaveLength(8);
    expect(many.at(-1)).toEqual(["…", "و3 منتجات أخرى"]);
  });

  it("sends every cart line to Zid in one draft order", async () => {
    const { buildZidOrderBody } = await import("../lib/zid-checkout");
    const body = buildZidOrderBody({ customerName: "سارة", phone: "0500000001", city: "الرياض", addressLine: "حي", lines: [{ sku: "A", quantity: 2 }, { sku: "B", quantity: 1 }], shippingMethodId: 1, paymentMethodId: 2, linkValidHours: 24 });
    expect(body.products).toEqual([{ sku: "A", quantity: 2 }, { sku: "B", quantity: 1 }]);
    const single = buildZidOrderBody({ customerName: "سارة", phone: "0500000001", city: "الرياض", addressLine: "حي", sku: "C", quantity: 3, shippingMethodId: 1, paymentMethodId: 2, linkValidHours: 24 });
    expect(single.products).toEqual([{ sku: "C", quantity: 3 }]);
  });
});
