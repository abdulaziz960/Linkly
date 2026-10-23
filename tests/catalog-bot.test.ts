import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-bot.db");
const tenantId = "tenant-catalog-bot";

const sent: Array<{ kind: "buttons" | "cta" | "list"; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "cta", input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "list", input }); return { ok: true }; })
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

async function seed(count: number, withUrl: boolean) {
  const { ensureSchema } = await import("../lib/database");
  const { createProduct, cleanProductInput } = await import("../lib/catalog");
  await ensureSchema();
  const created = [];
  for (let i = 1; i <= count; i += 1) {
    const clean = cleanProductInput({
      name: `سيارة ${i}`,
      price: 1000 * i,
      imageUrl: "https://example.com/a.jpg",
      productUrl: withUrl ? `https://example.com/p/${i}` : "",
      description: "وصف المنتج"
    });
    if (!clean.ok) throw new Error(clean.error);
    created.push(await createProduct(tenantId, clean.data));
  }
  return created;
}

function ctx() {
  const texts: string[] = [];
  return { texts, ctx: { channel: "whatsapp" as const, tenantId, conversationId: "c1", recipientId: "966500000000", sendText: async (t: string) => { texts.push(t); } } };
}

describe("catalog bot cards (WhatsApp)", () => {
  it("sends one list (name and price per row, 9 per page) with a show-more row, then pages on request", async () => {
    await seed(12, true);
    const { sendCatalogMenu, handleCatalogReply } = await import("../lib/catalog-bot");
    const { ctx: c } = ctx();

    sent.length = 0;
    await sendCatalogMenu(c, "تفضل");
    const lists = sent.filter((m) => m.kind === "list");
    expect(lists).toHaveLength(1);
    const rows = lists[0].input.rows as Array<{ id: string; title: string; description?: string }>;
    expect(rows).toHaveLength(10);
    expect(rows[0].id.startsWith("prod_")).toBe(true);
    expect(rows[0].description).toContain("1");
    expect(rows[9].id).toBe("catl_9:*");

    sent.length = 0;
    await handleCatalogReply(c, { id: "catl_9:*", text: "" }, "تفضل");
    const next = sent.find((m) => m.kind === "list")!.input.rows as Array<{ id: string }>;
    expect(next).toHaveLength(3);
    expect(next.some((row) => row.id.startsWith("catl_"))).toBe(false);
  });

  it("asks the category first when there are several, then lists that category", async () => {
    const { prisma } = await import("../lib/prisma");
    const { sendCatalogMenu, handleCatalogReply } = await import("../lib/catalog-bot");
    const { ctx: c } = ctx();
    const products = await prisma.product.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 4 });
    await prisma.product.update({ where: { id: products[0].id }, data: { category: "مشروبات" } });
    await prisma.product.update({ where: { id: products[1].id }, data: { category: "وجبات" } });

    sent.length = 0;
    await sendCatalogMenu(c, "تفضل");
    const rows = sent.find((m) => m.kind === "list")!.input.rows as Array<{ id: string; title: string }>;
    expect(rows.map((row) => row.title)).toEqual(expect.arrayContaining(["مشروبات", "وجبات", "أخرى", "كل المنتجات"]));

    sent.length = 0;
    await handleCatalogReply(c, { id: "catl_0:مشروبات", text: "" }, "تفضل");
    const only = sent.find((m) => m.kind === "list")!.input.rows as Array<{ id: string }>;
    expect(only).toHaveLength(1);
    expect(only[0].id).toBe(`prod_${products[0].id}`);
    await prisma.product.updateMany({ where: { tenantId }, data: { category: "" } });
  });

  it("with payment off a product shows its page button then the order buttons; with payment on it offers buy", async () => {
    const { listBotProducts, saveCatalogSettings } = await import("../lib/catalog");
    const { handleCatalogReply } = await import("../lib/catalog-bot");
    const [product] = await listBotProducts(tenantId, 1);
    const { ctx: c } = ctx();

    sent.length = 0;
    await handleCatalogReply(c, { id: `prod_${product.id}`, text: "" }, "");
    // Payment off with a product page: details carry the "open page" button, then the action buttons follow.
    expect(sent[0].kind).toBe("cta");
    expect(sent[0].input.url).toBe(product.productUrl);
    expect(String(sent[0].input.bodyText)).toContain("وصف المنتج");
    expect(sent[1].kind).toBe("buttons");
    expect((sent[1].input.buttons as Array<{ id: string; title: string }>).map((b) => b.title)).toEqual(["أضف للسلة", "تقديم طلب", "كل المنتجات"]);
    expect((sent[1].input.buttons as Array<{ id: string }>)[0].id).toBe(`cartadd_${product.id}`);
    expect((sent[1].input.buttons as Array<{ id: string }>)[1].id).toBe(`buy_${product.id}`);

    await saveCatalogSettings(tenantId, { paymentEnabled: true, gatewaySecretKey: "sk_test_abcdefghijklmnop1234" });
    sent.length = 0;
    await handleCatalogReply(c, { id: `prod_${product.id}`, text: "" }, "");
    expect(sent[0].kind).toBe("buttons");
    expect((sent[0].input.buttons as Array<{ id: string; title: string }>)[1]).toMatchObject({ id: `buy_${product.id}` });
  });
});
