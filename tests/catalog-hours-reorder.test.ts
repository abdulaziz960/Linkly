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
  sendWhatsAppImageByUrl: vi.fn(async () => ({ ok: true }))
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

    // 15:00 in Riyadh: the evening branch is closed, so only one is offered (as a button, with the closed one named)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 12, 0)));
    sent.length = 0;
    await sendCatalogMenu(c, "");
    // a single open branch is chosen for the customer, and the products follow
    expect(sent.some((x) => x.kind === "list")).toBe(true);

    // 18:30 UTC = 21:30 in Riyadh, both open; 20:30 UTC = 23:30, both closed
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 15, 30)));
    const { clearBranchChoice } = await import("../lib/catalog-branches");
    await clearBranchChoice("conv-hours");
    sent.length = 0;
    await sendCatalogMenu(c, "");
    expect(buttonIds()).toEqual(["br_hr-1", "br_hr-2"]);

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
