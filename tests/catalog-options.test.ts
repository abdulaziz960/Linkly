import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-options.db");
const tenantId = "tenant-options";

const sent: Array<{ kind: "buttons" | "list" | "cta"; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "list", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "cta", input }); return { ok: true }; })
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

async function seedProduct(name: string, price: number) {
  const { ensureSchema } = await import("../lib/database");
  const { createProduct, cleanProductInput } = await import("../lib/catalog");
  await ensureSchema();
  const clean = cleanProductInput({ name, price, description: "وصف" });
  if (!clean.ok) throw new Error(clean.error);
  return createProduct(tenantId, clean.data);
}

function ctx(conversationId: string) {
  const texts: string[] = [];
  return { texts, ctx: { channel: "whatsapp" as const, tenantId, conversationId, recipientId: "966500000000", sendText: async (t: string) => { texts.push(t); } } };
}

describe("option groups", () => {
  it("validates what the merchant enters", async () => {
    const { cleanGroupInput } = await import("../lib/catalog-options");
    expect(cleanGroupInput({ name: "", options: [{ name: "a" }] })).toMatchObject({ ok: false });
    expect(cleanGroupInput({ name: "الحجم", options: [] })).toMatchObject({ ok: false });
    expect(cleanGroupInput({ name: "الحجم", options: [{ name: "صغير" }, { name: "صغير" }] })).toMatchObject({ ok: false });
    expect(cleanGroupInput({ name: "الحجم", options: [{ name: "كبير", priceDelta: -2 }] })).toMatchObject({ ok: false });
    expect(cleanGroupInput({ name: "الحجم", options: Array.from({ length: 10 }, (_, i) => ({ name: `خيار ${i}` })) })).toMatchObject({ ok: false });
    const ok = cleanGroupInput({ name: " الإضافات ", multiple: true, maxChoices: 2, required: false, options: [{ name: "جبنة", priceDelta: "3" }, { name: "صوص" }] });
    expect(ok).toMatchObject({ ok: true, data: { name: "الإضافات", multiple: true, maxChoices: 2, required: false } });
  });

  it("checks a selection against the groups and adds up the extra price", async () => {
    const { resolveSelection } = await import("../lib/catalog-options");
    const groups = [
      { id: "g1", nameEn: "", productId: "p", name: "الحجم", required: true, multiple: false, maxChoices: 1, sortOrder: 0, options: [{ id: "s", groupId: "g1", name: "صغير", nameEn: "", priceDelta: 0, sortOrder: 0 }, { id: "l", groupId: "g1", name: "كبير", nameEn: "", priceDelta: 5, sortOrder: 1 }] },
      { id: "g2", nameEn: "", productId: "p", name: "إضافات", required: false, multiple: true, maxChoices: 2, sortOrder: 1, options: [{ id: "c", groupId: "g2", name: "جبنة", nameEn: "", priceDelta: 3, sortOrder: 0 }, { id: "x", groupId: "g2", name: "صوص", nameEn: "", priceDelta: 2, sortOrder: 1 }, { id: "z", groupId: "g2", name: "بصل", nameEn: "", priceDelta: 0, sortOrder: 2 }] }
    ];
    expect(resolveSelection(groups, ["l", "c", "x"])).toMatchObject({ ok: true, delta: 10, text: "كبير، جبنة، صوص" });
    expect(resolveSelection(groups, [])).toMatchObject({ ok: false, reason: "missing", groupName: "الحجم" });
    expect(resolveSelection(groups, ["s", "l"])).toMatchObject({ ok: false, reason: "too-many" });
    expect(resolveSelection(groups, ["s", "c", "x", "z"])).toMatchObject({ ok: false, reason: "too-many" });
    expect(resolveSelection(groups, ["s", "nope"])).toMatchObject({ ok: false, reason: "unknown" });
  });
});

describe("options in the cart and the order", () => {
  it("prices a configured line, keeps different choices as different lines and puts them in the order", async () => {
    const { saveGroup, groupsForProduct } = await import("../lib/catalog-options");
    const { addToCart, resolveCart } = await import("../lib/catalog-cart");
    const { createCartOrder } = await import("../lib/catalog");
    const burger = await seedProduct("برجر", 30);
    const size = await saveGroup(tenantId, { productId: burger.id, name: "الحجم", required: true, options: [{ name: "عادي" }, { name: "كبير", priceDelta: 5 }] });
    const extras = await saveGroup(tenantId, { productId: burger.id, name: "إضافات", required: false, multiple: true, maxChoices: 0, options: [{ name: "جبنة", priceDelta: 3 }] });
    expect(size.ok && extras.ok).toBe(true);
    const groups = await groupsForProduct(tenantId, burger.id);
    expect(groups.map((group) => group.name)).toEqual(["الحجم", "إضافات"]);
    const big = groups[0].options.find((option) => option.name === "كبير")!.id;
    const regular = groups[0].options.find((option) => option.name === "عادي")!.id;
    const cheese = groups[1].options[0].id;

    // A required group cannot be skipped
    expect((await addToCart(tenantId, "cart-1", burger.id, 1, [])).ok).toBe(false);
    expect((await addToCart(tenantId, "cart-1", burger.id, 2, [big, cheese])).ok).toBe(true);
    expect((await addToCart(tenantId, "cart-1", burger.id, 1, [cheese, big])).ok).toBe(true); // same choices, any order: one line
    expect((await addToCart(tenantId, "cart-1", burger.id, 1, [regular])).ok).toBe(true);

    const cart = await resolveCart(tenantId, "cart-1");
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0].product.name).toBe("برجر (كبير، جبنة)");
    expect(cart.lines[0].quantity).toBe(3);
    expect(cart.lines[0].product.price).toBe(38);
    expect(cart.lines[0].lineTotal).toBe(114);
    expect(cart.lines[1].product.name).toBe("برجر (عادي)");
    expect(cart.subtotal).toBe(144);

    const order = await createCartOrder({ tenantId, conversationId: "cart-1", customerName: "سارة", customerPhone: "966500000111", lines: cart.lines.map((line) => ({ product: line.product, quantity: line.quantity, baseName: line.baseName, optionDetails: line.optionDetails })), status: "new" });
    expect(order.total).toBe(144);
    // The order line keeps the product's own name; the options sit apart, with their group names
    expect(order.items?.[0]).toMatchObject({ productName: "برجر", unitPrice: 38, quantity: 3 });
    expect(order.items?.[0].options?.map((option) => `${option.group}: ${option.name}`)).toEqual(["الحجم: كبير", "إضافات: جبنة"]);
    const { listOrders } = await import("../lib/catalog");
    const stored = (await listOrders(tenantId)).find((entry) => entry.id === order.id);
    expect(stored?.items?.[0].options).toHaveLength(2);
    expect(stored?.productName).toBe("برجر، برجر");
  });

  it("drops a line whose options were removed since it was added", async () => {
    const { saveGroup, listGroups, deleteGroup } = await import("../lib/catalog-options");
    const { addToCart, resolveCart } = await import("../lib/catalog-cart");
    const drink = await seedProduct("عصير", 10);
    const saved = await saveGroup(tenantId, { productId: drink.id, name: "النوع", required: true, options: [{ name: "برتقال" }] });
    if (!saved.ok) throw new Error(saved.error);
    await addToCart(tenantId, "cart-2", drink.id, 1, [saved.group.options[0].id]);
    await deleteGroup(tenantId, saved.group.id);
    expect((await listGroups(tenantId, drink.id))).toHaveLength(0);
    const cart = await resolveCart(tenantId, "cart-2");
    // With no group left the saved option is unknown: the line is dropped and named.
    expect(cart.lines).toHaveLength(0);
    expect(cart.dropped[0]).toContain("عصير");
  });
});

describe("the bot asks the choices one after another", () => {
  it("walks size, then extras, then the quantity, and puts the configured product in the cart", async () => {
    const { saveGroup, groupsForProduct } = await import("../lib/catalog-options");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { resolveCart } = await import("../lib/catalog-cart");
    const pizza = await seedProduct("بيتزا", 40);
    await saveGroup(tenantId, { productId: pizza.id, name: "الحجم", required: true, options: [{ name: "وسط" }, { name: "كبير", priceDelta: 8 }] });
    await saveGroup(tenantId, { productId: pizza.id, name: "الإضافات", required: false, multiple: true, maxChoices: 0, options: [{ name: "جبنة", priceDelta: 4 }, { name: "زيتون", priceDelta: 2 }, { name: "فطر", priceDelta: 3 }] });
    const groups = await groupsForProduct(tenantId, pizza.id);
    const large = groups[0].options.find((o) => o.name === "كبير")!.id;
    const cheese = groups[1].options.find((o) => o.name === "جبنة")!.id;
    const olives = groups[1].options.find((o) => o.name === "زيتون")!.id;
    const { ctx: c, texts } = ctx("conv-bot");

    sent.length = 0;
    await handleCatalogReply(c, { id: `cartadd_${pizza.id}`, text: "" }, "");
    // The size group has two options: reply buttons, no "done" row for a required single choice.
    expect(sent[0].kind).toBe("buttons");
    expect((sent[0].input.buttons as Array<{ id: string; title: string }>).map((b) => b.title)).toEqual(["وسط", "كبير +8 ر.س"]);
    expect(String(sent[0].input.bodyText)).toContain("الحجم");

    sent.length = 0;
    await handleCatalogReply(c, { id: `opt_${large}`, text: "" }, "");
    // The extras group: three options plus "done" - a list.
    expect(sent[0].kind).toBe("list");
    expect((sent[0].input.rows as Array<{ id: string }>).map((r) => r.id)).toEqual([`opt_${cheese}`, `opt_${groups[1].options[1].id}`, `opt_${groups[1].options[2].id}`, "opt_done"]);

    sent.length = 0;
    await handleCatalogReply(c, { id: `opt_${cheese}`, text: "" }, "");
    // Picked once, the same group is asked again without that option and says what was chosen
    // (two options and "done" left: three rows fit reply buttons).
    expect(sent[0].kind).toBe("buttons");
    expect(String(sent[0].input.bodyText)).toContain("اخترت: جبنة");
    expect((sent[0].input.buttons as Array<{ id: string }>).some((b) => b.id === `opt_${cheese}`)).toBe(false);

    sent.length = 0;
    await handleCatalogReply(c, { id: `opt_${olives}`, text: "" }, "");
    await handleCatalogReply(c, { id: "opt_done", text: "" }, "");
    expect(texts.some((t) => t.includes("اخترت: كبير، جبنة، زيتون") && t.includes("+14"))).toBe(true);
    // The quantity question follows
    const quantityAsk = sent.at(-1)!;
    expect(String(quantityAsk.input.bodyText)).toContain("كم قطعة");

    await handleCatalogReply(c, { id: "cartqty_2", text: "" }, "");
    const cart = await resolveCart(tenantId, "conv-bot");
    expect(cart.lines[0].product.name).toBe("بيتزا (كبير، جبنة، زيتون)");
    expect(cart.lines[0].product.price).toBe(54);
    expect(cart.total).toBe(108);
  });

  it("a required group cannot be finished with nothing, a tap elsewhere abandons the questions, and \"buy now\" adds one unit", async () => {
    const { saveGroup, groupsForProduct, getOptionFlow } = await import("../lib/catalog-options");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { getCart } = await import("../lib/catalog-cart");
    const taco = await seedProduct("تاكو", 15);
    await saveGroup(tenantId, { productId: taco.id, name: "الحشوة", required: true, multiple: true, maxChoices: 2, options: [{ name: "دجاج" }, { name: "لحم" }, { name: "نباتي" }] });
    const groups = await groupsForProduct(tenantId, taco.id);
    const { ctx: c } = ctx("conv-bot2");

    await handleCatalogReply(c, { id: `buy_${taco.id}`, text: "" }, "");
    sent.length = 0;
    await handleCatalogReply(c, { id: "opt_done", text: "" }, "");
    expect(String(sent[0].input.bodyText)).toContain("اختر خيارًا واحدًا على الأقل");

    // Two picks reach the limit: the questions are over and "buy now" puts one unit in the cart.
    await handleCatalogReply(c, { id: `opt_${groups[0].options[0].id}`, text: "" }, "");
    await handleCatalogReply(c, { id: `opt_${groups[0].options[1].id}`, text: "" }, "");
    expect(await getOptionFlow("conv-bot2")).toBeNull();
    const cart = await getCart("conv-bot2");
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(1);
    expect(cart.lines[0].options).toHaveLength(2);

    // Starting again and tapping the cart abandons the questions.
    await handleCatalogReply(c, { id: `cartadd_${taco.id}`, text: "" }, "");
    expect(await getOptionFlow("conv-bot2")).not.toBeNull();
    await handleCatalogReply(c, { id: "cart_view", text: "" }, "");
    expect(await getOptionFlow("conv-bot2")).toBeNull();
  });

  it("works with numbers on channels without buttons", async () => {
    const { saveGroup } = await import("../lib/catalog-options");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { resolveCart } = await import("../lib/catalog-cart");
    const wrap = await seedProduct("ساندويش", 20);
    await saveGroup(tenantId, { productId: wrap.id, name: "الخبز", required: true, options: [{ name: "أبيض" }, { name: "أسمر", priceDelta: 1 }] });
    const texts: string[] = [];
    const c = { channel: "telegram" as const, tenantId, conversationId: "conv-tg", recipientId: "tg1", sendText: async (t: string) => { texts.push(t); } };
    await handleCatalogReply(c, { text: `سلة ${wrap.name}` }, "");
    expect(texts[0]).toContain("1) أبيض");
    expect(texts[0]).toContain("2) أسمر");
    await handleCatalogReply(c, { text: "2" }, "");
    await handleCatalogReply(c, { text: "3" }, "");
    const cart = await resolveCart(tenantId, "conv-tg");
    expect(cart.lines[0]).toMatchObject({ quantity: 3 });
    expect(cart.lines[0].product.name).toBe("ساندويش (أسمر)");
    expect(cart.lines[0].product.price).toBe(21);
  });
});

describe("groups for every product", () => {
  it("a group for every product applies to all of them", async () => {
    const { saveGroup, groupsForProduct } = await import("../lib/catalog-options");
    const a = await seedProduct("قهوة", 12);
    const b = await seedProduct("شاي", 8);
    const saved = await saveGroup(tenantId, { productId: "", name: "السكر", required: false, options: [{ name: "بدون" }, { name: "زيادة" }] });
    expect(saved.ok).toBe(true);
    expect((await groupsForProduct(tenantId, a.id)).map((g) => g.name)).toContain("السكر");
    expect((await groupsForProduct(tenantId, b.id)).map((g) => g.name)).toContain("السكر");
  });
});

describe("how the chosen options read", () => {
  const details = [
    { group: "الحجم", groupEn: "Size", name: "كبير", nameEn: "Large", delta: 0 },
    { group: "الإضافات", groupEn: "Extras", name: "جبن", nameEn: "Cheese", delta: 3 },
    { group: "الإضافات", groupEn: "Extras", name: "صوص", nameEn: "", delta: 2.5 }
  ];

  it("one line per group, extras with their price, in Arabic or English", async () => {
    const { optionLines } = await import("../lib/catalog-option-text");
    expect(optionLines(details)).toEqual(["الحجم: كبير", "الإضافات: جبن (+3 ر.س)، صوص (+2.5 ر.س)"]);
    // English uses the English names where they were given and falls back to the Arabic one
    expect(optionLines(details, "en")).toEqual(["Size: Large", "Extras: Cheese (+3 SAR), صوص (+2.5 SAR)"]);
    expect(optionLines([])).toEqual([]);
  });

  it("shows them under the product in the cart, the order summary and the payment message", async () => {
    const { saveGroup, groupsForProduct } = await import("../lib/catalog-options");
    const { addToCart, resolveCart, formatCart, formatOrderSummary } = await import("../lib/catalog-cart");
    const { createCartOrder } = await import("../lib/catalog");
    const { buildPaidOrderMessage } = await import("../lib/catalog-payments");
    const car = await seedProduct("كامري 2026", 100);
    const saved = await saveGroup(tenantId, { productId: car.id, name: "الحجم", nameEn: "Size", required: true, options: [{ name: "كبير", nameEn: "Large", priceDelta: 10 }] });
    if (!saved.ok) throw new Error(saved.error);
    const extras = await saveGroup(tenantId, { productId: car.id, name: "الإضافات", required: false, multiple: true, options: [{ name: "جبن", priceDelta: 3 }] });
    if (!extras.ok) throw new Error(extras.error);
    // English names are saved and loaded back
    const groups = (await groupsForProduct(tenantId, car.id)).filter((group) => group.productId === car.id);
    expect(groups[0]).toMatchObject({ name: "الحجم", nameEn: "Size" });
    expect(groups[0].options[0]).toMatchObject({ name: "كبير", nameEn: "Large" });

    await addToCart(tenantId, "cart-fmt", car.id, 1, [groups[0].options[0].id, groups[1].options[0].id]);
    const cart = await resolveCart(tenantId, "cart-fmt");
    const text = formatCart(cart);
    expect(text).toContain("*كامري 2026*");
    expect(text).toContain("الحجم: كبير");
    expect(text).toContain("الإضافات: جبن (+3 ر.س)");
    expect(text).not.toContain("(كبير، جبن)");
    expect(formatOrderSummary(cart)).toContain("الحجم: كبير");

    const order = await createCartOrder({ tenantId, conversationId: "cart-fmt", customerName: "سارة", customerPhone: "966500000111", lines: cart.lines.map((line) => ({ product: line.product, quantity: line.quantity, baseName: line.baseName, optionDetails: line.optionDetails })), status: "paid" });
    const message = buildPaidOrderMessage({ id: order.id, customerName: "سارة", customerPhone: "966500000111", productName: "x", quantity: 1, total: order.total, currency: "SAR" }, "2026-10-23T10:00:00Z", "", order.items);
    expect(message).toContain("• كامري 2026");
    expect(message).toContain("الحجم: كبير");
  });
});
