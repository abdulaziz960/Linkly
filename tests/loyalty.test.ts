import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-loyalty.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  process.env.DATABASE_URL = `file:${testDbPath}`;
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-32-characters";
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

const order = (tenantId: string, id: string, phone = "966500000111", extra: Record<string, string> = {}) => ({ id, tenantId, customerName: "سارة", customerPhone: phone, paymentId: `pay-${id}`, conversationId: "", ...extra });

describe("loyalty settings and text", () => {
  it("cleans settings into valid bounds", async () => {
    const { cleanLoyaltySettings } = await import("../lib/loyalty");
    const settings = cleanLoyaltySettings({ enabled: true, goal: 500, rewardKind: "percent", rewardValue: 150, validDays: 0, rewardKind2: "x" });
    expect(settings).toMatchObject({ enabled: true, goal: 50, rewardKind: "percent", rewardValue: 90, validDays: 30 });
    expect(cleanLoyaltySettings(null).enabled).toBe(false);
    expect(cleanLoyaltySettings({ rewardKind: "weird" }).rewardKind).toBe("percent");
  });

  it("fills the message variables", async () => {
    const { renderLoyaltyText } = await import("../lib/loyalty");
    expect(renderLoyaltyText("{name}: {done}/{goal}، بقي {left} لـ {reward} كود {code} حتى {date}", { name: "سارة", done: 1, goal: 4, reward: "خصم 20%", code: "WAFA-1", date: "2026-12-01" })).toBe("سارة: 1/4، بقي 3 لـ خصم 20% كود WAFA-1 حتى 2026-12-01");
  });
});

describe("counting WhatsApp orders", () => {
  it("counts paid orders, issues a personal single-use code at the goal and starts a new cycle", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty, loyaltyMessageFor, listLoyalty } = await import("../lib/loyalty");
    const { listDiscounts } = await import("../lib/catalog-discounts");
    await saveLoyaltySettings("t-loyal", { enabled: true, goal: 2, rewardKind: "percent", rewardValue: 20, validDays: 10 });

    const first = await recordPaidOrderForLoyalty(order("t-loyal", "o1"));
    expect(first).toMatchObject({ counted: true, done: 1 });
    expect(first.reward).toBeUndefined();
    expect(await loyaltyMessageFor(order("t-loyal", "o1"), first)).toContain("1 من 2");

    const second = await recordPaidOrderForLoyalty(order("t-loyal", "o2", "+966 500 000 111"));
    expect(second.reward?.code).toMatch(/^WAFA-[A-Z2-9]{5}$/);
    const message = await loyaltyMessageFor(order("t-loyal", "o2"), second);
    expect(message).toContain(second.reward!.code);

    const discounts = await listDiscounts("t-loyal");
    expect(discounts).toHaveLength(1);
    expect(discounts[0]).toMatchObject({ kind: "percent", value: 20, maxUses: 1 });

    const third = await recordPaidOrderForLoyalty(order("t-loyal", "o3"));
    expect(third).toMatchObject({ counted: true, done: 1 });

    const stats = await listLoyalty("t-loyal");
    expect(stats.customers).toHaveLength(1);
    expect(stats.customers[0]).toMatchObject({ phone: "966500000111", ordersInCycle: 1, totalOrders: 3, rewardsGiven: 1 });
    expect(stats.rewards).toHaveLength(1);
  });

  it("never counts the same order twice", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty } = await import("../lib/loyalty");
    await saveLoyaltySettings("t-dup", { enabled: true, goal: 5 });
    expect((await recordPaidOrderForLoyalty(order("t-dup", "d1"))).counted).toBe(true);
    expect(await recordPaidOrderForLoyalty(order("t-dup", "d1"))).toMatchObject({ counted: false, reason: "already-counted" });
  });

  it("ignores store orders, missing phones and workspaces with the program off", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty } = await import("../lib/loyalty");
    await saveLoyaltySettings("t-store", { enabled: true, goal: 2 });
    expect((await recordPaidOrderForLoyalty(order("t-store", "z1", "966500000111", { paymentId: "zid-123" }))).reason).toBe("store-order");
    expect((await recordPaidOrderForLoyalty(order("t-store", "z2", ""))).reason).toBe("no-phone");
    expect((await recordPaidOrderForLoyalty(order("t-off", "z3"))).reason).toBe("off");
  });

  it("gives a free product as a code worth its price, and keeps the progress when the product is gone", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty } = await import("../lib/loyalty");
    const { listDiscounts } = await import("../lib/catalog-discounts");
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.product.create({ data: { id: "p-coffee", tenantId: "t-free", name: "قهوة", price: 35, createdAt: now, updatedAt: now } });
    await saveLoyaltySettings("t-free", { enabled: true, goal: 1, rewardKind: "free_product", productId: "p-coffee" });
    const done = await recordPaidOrderForLoyalty(order("t-free", "f1"));
    expect(done.reward?.description).toContain("قهوة");
    const code = (await listDiscounts("t-free"))[0];
    expect(code).toMatchObject({ kind: "fixed", value: 35, minOrder: 35, maxUses: 1 });

    await saveLoyaltySettings("t-free2", { enabled: true, goal: 1, rewardKind: "free_product", productId: "missing" });
    const noProduct = await recordPaidOrderForLoyalty(order("t-free2", "f2"));
    expect(noProduct.reward).toBeUndefined();
    const { listLoyalty } = await import("../lib/loyalty");
    expect((await listLoyalty("t-free2")).customers[0]).toMatchObject({ ordersInCycle: 1, rewardsGiven: 0 });
  });

  it("a loyalty code belongs to the customer it was made for", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty, loyaltyCodeBelongsToOther } = await import("../lib/loyalty");
    await saveLoyaltySettings("t-own", { enabled: true, goal: 1 });
    const result = await recordPaidOrderForLoyalty(order("t-own", "w1", "966511111111"));
    const code = result.reward!.code;
    expect(await loyaltyCodeBelongsToOther("t-own", code, "0511111111")).toBe(false);
    expect(await loyaltyCodeBelongsToOther("t-own", code, "966522222222")).toBe(true);
    expect(await loyaltyCodeBelongsToOther("t-own", "NOT-A-LOYALTY-CODE", "966522222222")).toBe(false);
  });
});

describe("loyalty questions from the customer", () => {
  it("recognises questions about progress and rewards, not order questions", async () => {
    const { looksLikeLoyaltyQuestion } = await import("../lib/loyalty");
    for (const text of ["كم بقي لي على المكافأة؟", "وش رصيدي في الولاء", "نقاطي", "كم باقي لي", "عندي مكافأة؟", "my loyalty", "برنامج الولاء كيف؟"]) expect(looksLikeLoyaltyQuestion(text)).toBe(true);
    for (const text of ["كم باقي من القهوة", "كم بقي عندكم من المنتج", "وين طلبي", "السلام عليكم", "كم سعر القهوة", "ابغى طلب", ""]) expect(looksLikeLoyaltyQuestion(text)).toBe(false);
    expect(looksLikeLoyaltyQuestion("ولاء ".repeat(60))).toBe(false);
  });

  it("answers with progress and the customer's usable code only", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty, loyaltyStatusText } = await import("../lib/loyalty");
    await saveLoyaltySettings("t-ask", { enabled: true, goal: 2, rewardKind: "percent", rewardValue: 30 });
    await recordPaidOrderForLoyalty(order("t-ask", "a1"));
    const middle = await loyaltyStatusText("t-ask", "966500000111", "سارة");
    expect(middle).toContain("1 من 2");
    expect(middle).not.toContain("WAFA-");

    const reward = (await recordPaidOrderForLoyalty(order("t-ask", "a2"))).reward!;
    const after = await loyaltyStatusText("t-ask", "0500000111", "سارة");
    expect(after).toContain(reward.code);
    expect(await loyaltyStatusText("t-ask", "966599999999")).not.toContain(reward.code);
  });
});

describe("a free product of the customer's choice", () => {
  it("issues a free-item code with the merchant's price limit and evaluates it on the cart", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty, listLoyalty } = await import("../lib/loyalty");
    const { listDiscounts, evaluateDiscount } = await import("../lib/catalog-discounts");
    await saveLoyaltySettings("t-any", { enabled: true, goal: 1, rewardKind: "free_product", productId: "", rewardValue: 30 });
    const result = await recordPaidOrderForLoyalty(order("t-any", "any1"));
    expect(result.reward?.description).toContain("منتج مجاني من اختيارك");
    expect(result.reward?.description).toContain("حتى 30");
    const code = (await listDiscounts("t-any"))[0];
    expect(code).toMatchObject({ kind: "free_item", value: 30, maxUses: 1, minOrder: 0 });
    expect((await listLoyalty("t-any")).rewards).toHaveLength(1);

    // The dearest single item is free, up to the limit, and the customer still pays at least 1
    expect(evaluateDiscount(code, 100, Date.now(), [20, 45, 35])).toEqual({ ok: true, amount: 30 });
    expect(evaluateDiscount(code, 40, Date.now(), [25, 15])).toEqual({ ok: true, amount: 25 });
    expect(evaluateDiscount(code, 12, Date.now(), [12])).toEqual({ ok: true, amount: 11 });
    expect(evaluateDiscount({ ...code, value: 0 }, 100, Date.now(), [20, 45, 35])).toEqual({ ok: true, amount: 45 });
  });

  it("applies in the cart as the dearest item", async () => {
    const { saveLoyaltySettings, recordPaidOrderForLoyalty } = await import("../lib/loyalty");
    const { applyDiscountCode, addToCart, resolveCart } = await import("../lib/catalog-cart");
    const { createProduct, cleanProductInput } = await import("../lib/catalog");
    const { prisma } = await import("../lib/prisma");
    await saveLoyaltySettings("t-any2", { enabled: true, goal: 1, rewardKind: "free_product", productId: "", rewardValue: 0 });
    const reward = (await recordPaidOrderForLoyalty(order("t-any2", "any2", "966577777777"))).reward!;
    const cheap = cleanProductInput({ name: "شاي", price: 8 });
    const dear = cleanProductInput({ name: "وجبة", price: 40 });
    if (!cheap.ok || !dear.ok) throw new Error("product");
    const a = await createProduct("t-any2", cheap.data);
    const b = await createProduct("t-any2", dear.data);
    await prisma.customer.create({ data: { id: "c-any2", name: "سارة", phone: "966577777777", initial: "س", tenantId: "t-any2" } });
    await prisma.conversation.create({ data: { id: "v-any2", customerId: "c-any2", channel: "whatsapp", lastMessage: "x", status: "assigned", assignee: "أ", lastActivityAt: new Date().toISOString(), tenantId: "t-any2" } });
    await addToCart("t-any2", "v-any2", a.id, 2);
    await addToCart("t-any2", "v-any2", b.id, 1);
    expect(await applyDiscountCode("t-any2", "v-any2", reward.code)).toMatchObject({ ok: true, amount: 40 });
    const cart = await resolveCart("t-any2", "v-any2");
    expect(cart.subtotal).toBe(56);
    expect(cart.total).toBe(16);
  });
});
