import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-hours-reorder.db");
const tenantId = "tenant-hours-reorder";

const sent: Array<{ kind: string; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "list", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async () => ({ ok: true })),
  sendWhatsAppImageByUrl: vi.fn(async () => ({ ok: true })),
  sendWhatsAppLocationRequest: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "location-request", input }); return { ok: true }; })
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.useRealTimers();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

const buttonIds = () => ((sent.at(-1)!.input.buttons ?? sent.at(-1)!.input.rows) as Array<{ id: string }>).map((item) => item.id);

describe("branch hours in the chat", () => {
  it("leaves a closed branch out of the list and says when it opens; all closed ends the question", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { prisma } = await import("../lib/prisma");
    const { sendCatalogMenu } = await import("../lib/catalog-bot");
    const { createProduct, cleanProductInput } = await import("../lib/catalog");
    const clean = cleanProductInput({ name: "قهوة", price: 12 });
    if (!clean.ok) throw new Error(clean.error);
    await createProduct(tenantId, clean.data);
    const now = new Date().toISOString();
    for (const [id, name, hours] of [["hr-1", "فرع النهار", "9 ص - 11 م"], ["hr-2", "فرع المساء", "6 م - 11 م"]]) {
      await prisma.$executeRaw`INSERT INTO branches (id, tenant_id, name, working_hours, latitude, longitude, active, created_at, updated_at) VALUES (${id}, ${tenantId}, ${name}, ${hours}, 24.7, 46.6, 1, ${now}, ${now})`;
    }
    const texts: string[] = [];
    const c = { channel: "whatsapp" as const, tenantId, conversationId: "conv-hours", recipientId: "966500000333", sendText: async (t: string) => { texts.push(t); } };

    // 15:00 in Riyadh: the evening branch is closed. The customer still sees the branches first (the open one to tap,
    // the closed one named with when it opens) - nothing is picked for them while there are several.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 12, 0)));
    sent.length = 0;
    await sendCatalogMenu(c, "");
    expect(sent).toHaveLength(1);
    expect(String(sent[0].input.bodyText)).toContain("مغلق الآن");
    expect(String(sent[0].input.bodyText)).toContain("فرع المساء");
    expect((sent[0].input.rows as Array<{ id: string }>).map((row) => row.id)).toEqual(["br_hr-1"]);

    // 18:30 UTC = 21:30 in Riyadh, both open; 20:30 UTC = 23:30, both closed
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 15, 30)));
    const { clearBranchChoice } = await import("../lib/catalog-branches");
    await clearBranchChoice("conv-hours");
    sent.length = 0;
    await sendCatalogMenu(c, "");
    expect(buttonIds()).toEqual(["brnearest", "br_hr-1", "br_hr-2"]);

    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 20, 30)));
    await clearBranchChoice("conv-hours");
    sent.length = 0;
    texts.length = 0;
    await sendCatalogMenu(c, "");
    expect(sent).toHaveLength(0);
    expect(texts.join("\n")).toContain("جميع فروعنا مغلقة");
    vi.useRealTimers();
  });
});

describe("reordering the last order", () => {
  it("puts the last order's lines back in the cart and names what is gone", async () => {
    const { prisma } = await import("../lib/prisma");
    const { createProduct, cleanProductInput, createCartOrder, updateOrderStatus, getProduct } = await import("../lib/catalog");
    const { getCart } = await import("../lib/catalog-cart");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const t2 = "tenant-reorder";
    const a = cleanProductInput({ name: "برجر", price: 20 });
    const b = cleanProductInput({ name: "بطاطس", price: 8 });
    if (!a.ok || !b.ok) throw new Error("product");
    const burger = await createProduct(t2, a.data);
    const fries = await createProduct(t2, b.data);
    const now = new Date().toISOString();
    await prisma.customer.create({ data: { id: "cust-re", name: "سارة", phone: "966500000444", initial: "س", tenantId: t2 } });
    await prisma.conversation.create({ data: { id: "conv-re", customerId: "cust-re", channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: now, tenantId: t2 } });
    const burgerProduct = (await getProduct(t2, burger.id))!;
    const friesProduct = (await getProduct(t2, fries.id))!;
    const order = await createCartOrder({ tenantId: t2, conversationId: "conv-re", customerName: "سارة", customerPhone: "966500000444", lines: [{ product: burgerProduct, quantity: 2 }, { product: friesProduct, quantity: 1 }], status: "new" });
    await updateOrderStatus(t2, order.id, "paid");
    // one product goes out of the menu
    await prisma.product.update({ where: { id: fries.id }, data: { active: 0 } });

    const texts: string[] = [];
    const c = { channel: "whatsapp" as const, tenantId: t2, conversationId: "conv-re", recipientId: "966500000444", sendText: async (t: string) => { texts.push(t); } };
    sent.length = 0;
    await handleCatalogReply(c, { id: "reorder_last", text: "" }, "");
    const cart = await getCart("conv-re");
    expect(cart.lines).toEqual([expect.objectContaining({ productId: burger.id, quantity: 2 })]);
    const shown = String(sent.at(-1)!.input.bodyText);
    expect(shown).toContain("أضفنا طلبك السابق");
    expect(shown).toContain("لم يعد متوفرًا: بطاطس");
  });
});

describe("opening the catalog with branches", () => {
  it("asks which branch every time, as a list that shows each branch's city", async () => {
    const { prisma } = await import("../lib/prisma");
    const { openCatalog } = await import("../lib/catalog-bot");
    const { setBranchChoice, getBranchChoice } = await import("../lib/catalog-branches");
    const { createProduct, cleanProductInput } = await import("../lib/catalog");
    const t3 = "tenant-open-catalog";
    const clean = cleanProductInput({ name: "شاي", price: 5 });
    if (!clean.ok) throw new Error(clean.error);
    await createProduct(t3, clean.data);
    const now = new Date().toISOString();
    for (const [id, name, city] of [["oc-1", "فرع ١", "الرياض"], ["oc-2", "فرع ٢", "جدة"]]) {
      await prisma.$executeRaw`INSERT INTO branches (id, tenant_id, name, address, latitude, longitude, active, created_at, updated_at) VALUES (${id}, ${t3}, ${name}, ${city}, 24.7, 46.6, 1, ${now}, ${now})`;
    }
    const c = { channel: "whatsapp" as const, tenantId: t3, conversationId: "conv-oc", recipientId: "966500000555", sendText: async () => undefined };
    await setBranchChoice(t3, "conv-oc", "oc-1"); // picked earlier
    sent.length = 0;
    await openCatalog(c, "");
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("list");
    expect((sent[0].input.rows as unknown[]).slice(1)).toEqual([expect.objectContaining({ id: "br_oc-1", title: "فرع ١", description: "الرياض" }), expect.objectContaining({ id: "br_oc-2", title: "فرع ٢", description: "جدة" })]);
    expect(await getBranchChoice(t3, "conv-oc")).toBeNull();
  });

  it("offers the nearest branch, asks for a location, and picks the closest one", async () => {
    const { openCatalog, handleCatalogReply } = await import("../lib/catalog-bot");
    const { getBranchChoice } = await import("../lib/catalog-branches");
    const { prisma } = await import("../lib/prisma");
    const t3 = "tenant-open-catalog";
    // Riyadh (oc-1) and Jeddah (oc-2)
    await prisma.$executeRaw`UPDATE branches SET latitude = 24.71, longitude = 46.67 WHERE id = 'oc-1'`;
    await prisma.$executeRaw`UPDATE branches SET latitude = 21.54, longitude = 39.17 WHERE id = 'oc-2'`;
    const texts: string[] = [];
    const c = { channel: "whatsapp" as const, tenantId: t3, conversationId: "conv-oc2", recipientId: "966500000666", sendText: async (t: string) => { texts.push(t); } };
    sent.length = 0;
    await openCatalog(c, "");
    expect((sent[0].input.rows as Array<{ id: string }>)[0].id).toBe("brnearest");

    sent.length = 0;
    await handleCatalogReply(c, { id: "brnearest", text: "" }, "");
    expect(sent.map((x) => x.kind)).toEqual(["location-request"]);

    // a customer standing near Jeddah gets the Jeddah branch, and the menu follows
    sent.length = 0;
    await handleCatalogReply(c, { text: "", location: { latitude: 21.5, longitude: 39.2 } }, "");
    expect((await getBranchChoice(t3, "conv-oc2"))?.id).toBe("oc-2");
    expect(texts.join("\n")).toContain("أقرب فرع لك: *فرع ٢*");
    expect(sent.some((x) => x.kind === "list")).toBe(true);
  });

  it("asks the branch again when the customer types for the catalog in the middle of a chat", async () => {
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const { setBranchChoice, getBranchChoice } = await import("../lib/catalog-branches");
    const t3 = "tenant-open-catalog";
    const c = { channel: "whatsapp" as const, tenantId: t3, conversationId: "conv-oc3", recipientId: "966500000777", sendText: async () => undefined };
    await setBranchChoice(t3, "conv-oc3", "oc-1");
    sent.length = 0;
    expect(await handleCatalogReply(c, { text: "الكتالوج" }, "")).toBe("handled");
    expect(sent[0].kind).toBe("list");
    expect(String(sent[0].input.bodyText)).toContain("من أي فرع");
    expect(await getBranchChoice(t3, "conv-oc3")).toBeNull();
  });
});
