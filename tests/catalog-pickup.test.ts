import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-pickup.db");
const tenantId = "tenant-pickup";

const sent: Array<{ kind: "buttons" | "list"; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "list", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async () => ({ ok: true }))
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

async function seed(conversationId: string) {
  const { ensureSchema } = await import("../lib/database");
  const { createProduct, cleanProductInput } = await import("../lib/catalog");
  const { addToCart } = await import("../lib/catalog-cart");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const clean = cleanProductInput({ name: "وجبة", price: 25, description: "وصف" });
  if (!clean.ok) throw new Error(clean.error);
  const product = await createProduct(tenantId, clean.data);
  await prisma.customer.create({ data: { id: `cust-${conversationId}`, name: "سارة", phone: "966500000111", initial: "س", tenantId } });
  await prisma.conversation.create({ data: { id: conversationId, customerId: `cust-${conversationId}`, channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: new Date().toISOString(), tenantId } });
  await addToCart(tenantId, conversationId, product.id, 2);
  return product;
}

function ctx(conversationId: string) {
  const texts: string[] = [];
  return { texts, ctx: { channel: "whatsapp" as const, tenantId, conversationId, recipientId: "966500000111", sendText: async (t: string) => { texts.push(t); } } };
}

const buttonIds = () => (sent.at(-1)!.input.buttons as Array<{ id: string }>).map((b) => b.id);

describe("plates and settings", () => {
  it("cleans plate numbers", async () => {
    const { cleanPlate, cleanCarDetails, cleanPickupSettings, pickupText } = await import("../lib/catalog-pickup");
    expect(cleanPlate("أ ب ج  ١٢٣٤")).toBe("أ ب ج 1234");
    expect(cleanPlate("abc-1234")).toBe("ABC-1234");
    expect(cleanPlate("12")).toBeNull();
    expect(cleanPlate("a;b")).toBeNull();
    expect(cleanPlate("x".repeat(20))).toBeNull();
    expect(cleanCarDetails("  كامري   بيضاء ")).toBe("كامري بيضاء");
    expect(cleanPickupSettings({ enabled: true, inStore: false, curbside: false }).enabled).toBe(false);
    expect(pickupText({ kind: "car", plate: "ABC 1234", carDetails: "كامري" })).toBe("استلام من السيارة — رقم اللوحة: ABC 1234 — السيارة: كامري");
    expect(pickupText({ kind: "store", plate: "", carDetails: "" })).toBe("استلام بنفسك من المحل");
  });
});

describe("checkout with pickup", () => {
  it("asks delivery or pickup, then car or store, the plate, and stores the choice with the order", async () => {
    const { savePickupSettings, getPickupChoice, getOrderPickup } = await import("../lib/catalog-pickup");
    const { createShippingMethod } = await import("../lib/catalog-shipping");
    const created = await createShippingMethod(tenantId, { name: "توصيل المطعم", price: 10, cities: [] });
    expect(created.ok).toBe(true);
    await savePickupSettings(tenantId, { enabled: true, inStore: true, curbside: true });
    await seed("conv-pick");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { listOrders } = await import("../lib/catalog");
    const { ctx: c, texts } = ctx("conv-pick");

    sent.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(buttonIds()).toEqual(["ful_delivery", "ful_pickup"]);

    await handleCatalogReply(c, { id: "ful_pickup", text: "" }, "");
    expect(buttonIds()).toEqual(["pk_car", "pk_store"]);

    await handleCatalogReply(c, { id: "pk_car", text: "" }, "");
    expect(texts.at(-1)).toContain("رقم لوحة");

    // A bad plate is asked again
    await handleCatalogReply(c, { text: "؟؟" }, "");
    expect(texts.at(-1)).toContain("رقم اللوحة بشكل صحيح");

    await handleCatalogReply(c, { text: "أ ب ج ١٢٣٤" }, "");
    expect(buttonIds()).toEqual(["pk_confirm", "pk_edit"]);
    expect(String(sent.at(-1)!.input.bodyText)).toContain("رقم اللوحة: أ ب ج 1234");

    await handleCatalogReply(c, { id: "pk_confirm", text: "" }, "");
    // The pending choice goes away once the order is placed
    expect(await getPickupChoice("conv-pick")).toBeNull();
    // With no payment gateway the order goes to the staff with the pickup in its note
    const orders = await listOrders(tenantId);
    expect(orders).toHaveLength(1);
    expect(orders[0].pickup).toMatchObject({ kind: "car", plate: "أ ب ج 1234" });
    expect(orders[0].shipping).toBeUndefined();
    expect((await getOrderPickup([orders[0].id])).get(orders[0].id)?.kind).toBe("car");
    expect(texts.at(-1)).toContain("استلام من السيارة");
  });

  it("with only pickup on it skips the delivery question, and with only the store it confirms straight away", async () => {
    const { savePickupSettings } = await import("../lib/catalog-pickup");
    const { deleteShippingMethod, listShippingMethods } = await import("../lib/catalog-shipping");
    for (const method of await listShippingMethods(tenantId)) await deleteShippingMethod(tenantId, method.id);
    await savePickupSettings(tenantId, { enabled: true, inStore: true, curbside: false });
    await seed("conv-store");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { ctx: c } = ctx("conv-store");
    sent.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(buttonIds()).toEqual(["pk_confirm", "pk_edit"]);
    expect(String(sent.at(-1)!.input.bodyText)).toContain("استلام بنفسك من المحل");
  });

  it("asks for the car's colour and type when the merchant wants it, and can be skipped", async () => {
    const { savePickupSettings, getPickupChoice } = await import("../lib/catalog-pickup");
    await savePickupSettings(tenantId, { enabled: true, inStore: false, curbside: true, askCarDetails: true });
    await seed("conv-details");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { ctx: c, texts } = ctx("conv-details");
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    // the same phone picked up by car in the first test, so its car is offered; a new one is chosen here
    expect(buttonIds()).toEqual(["pk_saved", "pk_new"]);
    await handleCatalogReply(c, { id: "pk_new", text: "" }, "");
    expect(texts.at(-1)).toContain("رقم لوحة");
    await handleCatalogReply(c, { text: "ABC 1234" }, "");
    expect(texts.at(-1)).toContain("لون ونوع");
    await handleCatalogReply(c, { text: "كامري بيضاء" }, "");
    await handleCatalogReply(c, { id: "pk_confirm", text: "" }, "");
    const { listOrders } = await import("../lib/catalog");
    const order = (await listOrders(tenantId)).find((entry) => entry.pickup?.plate === "ABC 1234");
    expect(order?.pickup).toMatchObject({ kind: "car", plate: "ABC 1234", carDetails: "كامري بيضاء" });
    expect(await getPickupChoice("conv-details")).toBeNull();
  });

  it("offers the car the customer used last time (kept by phone) or a new one", async () => {
    const { savePickupSettings, getSavedCar } = await import("../lib/catalog-pickup");
    await savePickupSettings(tenantId, { enabled: true, inStore: false, curbside: true, askCarDetails: true });
    expect(await getSavedCar(tenantId, "+966 500 000 111")).toEqual({ plate: "ABC 1234", carDetails: "كامري بيضاء" });
    await seed("conv-saved");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { listOrders } = await import("../lib/catalog");
    const { ctx: c } = ctx("conv-saved");
    sent.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(buttonIds()).toEqual(["pk_saved", "pk_new"]);
    expect(String(sent.at(-1)!.input.bodyText)).toContain("ABC 1234");
    expect(String(sent.at(-1)!.input.bodyText)).toContain("كامري بيضاء");
    // using it goes straight to the confirmation with that car
    await handleCatalogReply(c, { id: "pk_saved", text: "" }, "");
    expect(buttonIds()).toEqual(["pk_confirm", "pk_edit"]);
    expect(String(sent.at(-1)!.input.bodyText)).toContain("ABC 1234");
    await handleCatalogReply(c, { id: "pk_confirm", text: "" }, "");
    expect((await listOrders(tenantId)).filter((entry) => entry.pickup?.plate === "ABC 1234").length).toBeGreaterThanOrEqual(2);
  });

  it("cancel goes back to the cart, and pickup switched off falls back to the usual checkout", async () => {
    const { savePickupSettings, getPickupChoice } = await import("../lib/catalog-pickup");
    await savePickupSettings(tenantId, { enabled: true, inStore: true, curbside: true });
    await seed("conv-cancel");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { getCheckoutFlow } = await import("../lib/catalog-checkout-flow");
    const { ctx: c } = ctx("conv-cancel");
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect((await getCheckoutFlow("conv-cancel"))?.step).toBe("pickup_kind");
    await handleCatalogReply(c, { text: "إلغاء" }, "");
    expect(await getCheckoutFlow("conv-cancel")).toBeNull();
    expect(await getPickupChoice("conv-cancel")).toBeNull();
  });
});
