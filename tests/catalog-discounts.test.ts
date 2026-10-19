import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-discounts.db");
const tenantId = "tenant-catalog-discounts";

const sent: Array<{ input: Record<string, unknown> }> = [];
const invoices: Array<{ amount: number }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ input }); return { ok: true }; })
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

const day = 86_400_000;

describe("discount code rules", () => {
  it("validates what a merchant types", async () => {
    const { cleanDiscountInput } = await import("../lib/catalog-discounts");
    // spaces around or inside are dropped: customers type codes on a phone
    expect(cleanDiscountInput({ code: " save 10 ", kind: "percent", value: 10 })).toMatchObject({ ok: true, data: { code: "SAVE10" } });
    expect(cleanDiscountInput({ code: "حفظ@10", kind: "percent", value: 10 })).toMatchObject({ ok: false });
    expect(cleanDiscountInput({ code: "save10", kind: "percent", value: 10 })).toMatchObject({ ok: true, data: { code: "SAVE10", kind: "percent", value: 10, minOrder: 0, maxUses: 0, expiresAt: "" } });
    expect(cleanDiscountInput({ code: "AB", kind: "percent", value: 10 })).toMatchObject({ ok: false });
    expect(cleanDiscountInput({ code: "BIG", kind: "percent", value: 95 })).toMatchObject({ ok: false, error: expect.stringContaining("90") });
    expect(cleanDiscountInput({ code: "ZERO", kind: "fixed", value: 0 })).toMatchObject({ ok: false });
    expect(cleanDiscountInput({ code: "ARB", kind: "fixed", value: 25, minOrder: 100, maxUses: 50, expiresAt: "2026-12-31" })).toMatchObject({ ok: true, data: { minOrder: 100, maxUses: 50 } });
    expect(cleanDiscountInput({ code: "BADDATE", kind: "fixed", value: 5, expiresAt: "not a date" })).toMatchObject({ ok: false });
  });

  it("works out the amount off, honours limits, and never makes the order free", async () => {
    const { evaluateDiscount } = await import("../lib/catalog-discounts");
    const base = { id: "d", code: "X", kind: "percent" as const, value: 10, minOrder: 0, maxUses: 0, usedCount: 0, expiresAt: "", active: true, createdAt: "" };
    expect(evaluateDiscount(base, 200)).toEqual({ ok: true, amount: 20 });
    expect(evaluateDiscount({ ...base, kind: "fixed", value: 30 }, 200)).toEqual({ ok: true, amount: 30 });
    // a fixed amount bigger than the order leaves 1 to pay
    expect(evaluateDiscount({ ...base, kind: "fixed", value: 500 }, 200)).toEqual({ ok: true, amount: 199 });
    expect(evaluateDiscount({ ...base, minOrder: 300 }, 200)).toMatchObject({ ok: false, reason: expect.stringContaining("300") });
    expect(evaluateDiscount({ ...base, active: false }, 200)).toMatchObject({ ok: false });
    expect(evaluateDiscount({ ...base, expiresAt: new Date(Date.now() - day).toISOString() }, 200)).toMatchObject({ ok: false, reason: expect.stringContaining("انتهت") });
    expect(evaluateDiscount({ ...base, expiresAt: new Date(Date.now() + day).toISOString() }, 200)).toMatchObject({ ok: true });
    expect(evaluateDiscount({ ...base, maxUses: 2, usedCount: 2 }, 200)).toMatchObject({ ok: false, reason: expect.stringContaining("الحد الأقصى") });
  });

  it("creates, finds by any casing, rejects a duplicate, switches and deletes", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { createDiscount, findDiscountByCode, listDiscounts, setDiscountActive, deleteDiscount, redeemDiscount, releaseDiscountUse } = await import("../lib/catalog-discounts");
    await ensureSchema();
    const created = await createDiscount(tenantId, { code: "welcome", kind: "percent", value: 15, maxUses: 1 });
    expect(created).toMatchObject({ ok: true, discount: { code: "WELCOME", active: true, usedCount: 0 } });
    expect(await createDiscount(tenantId, { code: "WELCOME", kind: "fixed", value: 5 })).toEqual({ ok: false, error: "هذا الكود موجود مسبقًا" });
    expect(await createDiscount("other-tenant", { code: "WELCOME", kind: "fixed", value: 5 })).toMatchObject({ ok: true });

    const found = await findDiscountByCode(tenantId, "  welcome ");
    expect(found?.value).toBe(15);
    // the single allowed use goes to the first taker only
    expect(await redeemDiscount(tenantId, found!.id)).toBe(true);
    expect(await redeemDiscount(tenantId, found!.id)).toBe(false);
    await releaseDiscountUse(tenantId, found!.id);
    expect(await redeemDiscount(tenantId, found!.id)).toBe(true);

    expect(await setDiscountActive(tenantId, found!.id, false)).toBe(true);
    expect((await findDiscountByCode(tenantId, "WELCOME"))?.active).toBe(false);
    expect(await setDiscountActive("other-tenant", found!.id, true)).toBe(false);
    expect(await listDiscounts(tenantId)).toHaveLength(1);
    expect(await deleteDiscount(tenantId, found!.id)).toBe(true);
    expect(await findDiscountByCode(tenantId, "WELCOME")).toBeNull();
  });
});

async function seed() {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  const { createProduct, cleanProductInput, saveCatalogSettings } = await import("../lib/catalog");
  await ensureSchema();
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

describe("a discount code in the chat cart", () => {
  it("is asked for, applied, shown in the cart, charged at the lower total, and given back when the order is cancelled", async () => {
    const { prisma } = await import("../lib/prisma");
    const { createDiscount, findDiscountByCode } = await import("../lib/catalog-discounts");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { updateOrderStatus, listOrders } = await import("../lib/catalog");
    const { product, conversation } = await seed();
    await createDiscount(tenantId, { code: "SAVE10", kind: "percent", value: 10, minOrder: 100 });
    const cid = "disc-chat";
    await conversation(cid);
    const { ctx: c, texts } = ctx(cid);
    await addToCart(tenantId, cid, product.id, 2);

    // the button asks for the code; a wrong one is refused and we keep waiting
    texts.length = 0;
    await handleCatalogReply(c, { id: "cart_code", text: "" }, "");
    expect(texts.at(-1)).toContain("اكتب كود الخصم");
    await handleCatalogReply(c, { text: "NOPE" }, "");
    expect(texts.at(-1)).toContain("هذا الكود غير صحيح");

    // the right one (any casing) is applied and the cart shows it
    sent.length = 0;
    await handleCatalogReply(c, { text: "save10" }, "");
    const cart = lastBody();
    expect(cart).toContain("المجموع قبل الخصم: 400 ر.س");
    expect(cart).toContain("الخصم (SAVE10): -40 ر.س");
    expect(cart).toContain("الإجمالي: 360 ر.س");
    expect(cart).not.toMatch(/[\u{1F300}-\u{1FAFF}✅➕⚠]/u);
    // with a code on the cart there is no "I have a discount code" button any more, and the way to drop it is told
    const applied = sent.at(-1)?.input as { bodyText: string; buttons: Array<{ id: string }> };
    expect(applied.buttons.map((b) => b.id)).toEqual(["cart_pay", "cat_back"]);
    expect(applied.bodyText).toContain("حذف الكود");

    // paying charges the discounted total, records the code, and takes one use
    invoices.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(invoices).toEqual([{ amount: 360 }]);
    expect(texts.at(-1)).toContain("الخصم (SAVE10): -40 ر.س");
    expect(texts.at(-1)).toContain("الإجمالي: 360 ر.س");
    const order = (await prisma.catalogOrder.findMany({ where: { conversationId: cid } }))[0];
    expect(order).toMatchObject({ total: 360, status: "awaiting_payment" });
    expect((await listOrders(tenantId)).find((item) => item.id === order.id)?.discount).toEqual({ code: "SAVE10", amount: 40 });
    expect((await findDiscountByCode(tenantId, "SAVE10"))?.usedCount).toBe(1);

    expect(await updateOrderStatus(tenantId, order.id, "cancelled")).toBe(true);
    expect((await findDiscountByCode(tenantId, "SAVE10"))?.usedCount).toBe(0);
  });

  it("accepts a typed 'كود …' command, can drop the code, and ignores a code the cart is too small for", async () => {
    const { createDiscount } = await import("../lib/catalog-discounts");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { product, conversation } = await seed().catch(async () => {
      const { prisma } = await import("../lib/prisma");
      return { product: (await prisma.product.findMany({ where: { tenantId } }))[0] as never, conversation: async (id: string) => {
        await prisma.customer.create({ data: { id: `cust-${id}`, name: "سارة", phone: "966500000001", initial: "س", tenantId } });
        await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
      } };
    });
    await createDiscount(tenantId, { code: "BIGCART", kind: "fixed", value: 50, minOrder: 1000 });
    const cid = "disc-typed";
    await conversation(cid);
    const { ctx: c, texts } = ctx(cid);
    await addToCart(tenantId, cid, (product as { id: string }).id, 1);

    texts.length = 0;
    await handleCatalogReply(c, { text: "كود BIGCART" }, "");
    expect(texts.at(-1)).toContain("لا يقل عن 1000");

    sent.length = 0;
    await handleCatalogReply(c, { text: "كود save10" }, "");
    expect(lastBody()).toContain("الخصم (SAVE10): -20 ر.س");
    await handleCatalogReply(c, { text: "حذف الكود" }, "");
    expect(lastBody()).not.toContain("الخصم (");
    expect(lastBody()).toContain("الإجمالي: 200 ر.س");
  });

  it("lets a customer who taps 'buy now' use a code too: the product goes into the cart, which opens", async () => {
    const { prisma } = await import("../lib/prisma");
    const { createDiscount } = await import("../lib/catalog-discounts");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const product = (await prisma.product.findMany({ where: { tenantId } }))[0];
    await createDiscount(tenantId, { code: "NOWCODE", kind: "percent", value: 25 });
    const cid = "disc-buynow";
    await prisma.customer.create({ data: { id: `cust-${cid}`, name: "عميل", phone: "966500000003", initial: "ع", tenantId } });
    await prisma.conversation.create({ data: { id: cid, customerId: `cust-${cid}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
    const { ctx: c } = ctx(cid);

    sent.length = 0;
    invoices.length = 0;
    await handleCatalogReply(c, { id: `buy_${product.id}`, text: "" }, "");
    const shown = sent.at(-1)?.input as { bodyText: string; buttons: Array<{ id: string }> };
    expect(shown.bodyText).toContain("أضفنا «ساعة» إلى سلتك");
    expect(shown.buttons.map((b) => b.id)).toEqual(["cart_pay", "cart_code", "cat_back"]);
    expect(invoices).toHaveLength(0); // nothing is charged yet
    expect(await prisma.catalogOrder.count({ where: { conversationId: cid } })).toBe(0);

    // pressing "buy now" again does not add a second unit
    await handleCatalogReply(c, { id: `buy_${product.id}`, text: "" }, "");
    expect(String((sent.at(-1)?.input as { bodyText: string }).bodyText)).toContain("الكمية: 1");

    await handleCatalogReply(c, { text: "كود nowcode" }, "");
    expect(String((sent.at(-1)?.input as { bodyText: string }).bodyText)).toContain("الإجمالي: 150 ر.س");
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(invoices).toEqual([{ amount: 150 }]);
  });

  it("gives the last use of a code to one customer only", async () => {
    const { createDiscount, findDiscountByCode } = await import("../lib/catalog-discounts");
    const { addToCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { prisma } = await import("../lib/prisma");
    const product = (await prisma.product.findMany({ where: { tenantId } }))[0];
    await createDiscount(tenantId, { code: "ONCE", kind: "fixed", value: 25, maxUses: 1 });
    const make = async (id: string) => {
      await prisma.customer.create({ data: { id: `cust-${id}`, name: "عميل", phone: "966500000002", initial: "ع", tenantId } });
      await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
      await addToCart(tenantId, id, product.id, 1);
    };
    await make("once-a");
    await make("once-b");
    const a = ctx("once-a");
    const b = ctx("once-b");
    // both apply it while one use is left
    await handleCatalogReply(a.ctx, { text: "كود ONCE" }, "");
    await handleCatalogReply(b.ctx, { text: "كود ONCE" }, "");
    // a pays first and takes the use; b is told the code is gone and nothing is charged
    invoices.length = 0;
    await handleCatalogReply(a.ctx, { id: "cart_pay", text: "" }, "");
    expect(invoices).toEqual([{ amount: 175 }]);
    sent.length = 0;
    await handleCatalogReply(b.ctx, { id: "cart_pay", text: "" }, "");
    expect(invoices).toHaveLength(1);
    expect(lastBody()).toContain("تم إلغاء كود الخصم");
    expect(lastBody()).toContain("الإجمالي: 200 ر.س");
    expect((await findDiscountByCode(tenantId, "ONCE"))?.usedCount).toBe(1);
  });
});

describe("after payment", () => {
  it("shows the discount in the confirmation message", async () => {
    const { buildPaidOrderMessage } = await import("../lib/catalog-payments");
    const message = buildPaidOrderMessage(
      { id: "ord-abcdef123456", customerName: "سارة", customerPhone: "966500000001", productName: "ساعة", quantity: 2, total: 360, currency: "SAR" },
      new Date().toISOString(), "", undefined, { code: "SAVE10", amount: 40 }
    );
    expect(message).toContain("الخصم (SAVE10): -40 ر.س");
    expect(message).toContain("المبلغ المدفوع: 360 ر.س");
    expect(buildPaidOrderMessage({ id: "ord-abcdef123456", customerName: "", customerPhone: "", productName: "ساعة", quantity: 1, total: 200, currency: "SAR" }, new Date().toISOString())).not.toContain("الخصم");
  });
});
