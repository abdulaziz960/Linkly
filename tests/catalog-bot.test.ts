import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-bot.db");
const tenantId = "tenant-catalog-bot";

const sent: Array<{ kind: "buttons" | "cta"; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
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
  it("sends image cards (10 per page) with a show-more button, then pages on request", async () => {
    await seed(12, true);
    const { sendCatalogMenu, handleCatalogReply } = await import("../lib/catalog-bot");
    const { ctx: c, texts } = ctx();

    sent.length = 0;
    await sendCatalogMenu(c, "تفضل");
    const cards = sent.filter((m) => m.kind === "buttons" && (m.input.buttons as Array<{ id: string }>)[0].id.startsWith("prod_"));
    expect(cards).toHaveLength(10);
    expect(cards.every((m) => m.input.headerImageUrl === "https://example.com/a.jpg")).toBe(true);
    expect(texts[0]).toBe("تفضل");
    const footer = sent.at(-1)!.input.buttons as Array<{ id: string }>;
    expect(footer.map((b) => b.id)).toContain("cat_more_10");

    sent.length = 0;
    await handleCatalogReply(c, { id: "cat_more_10", text: "" }, "تفضل");
    expect(sent.filter((m) => (m.input.buttons as Array<{ id: string }>)[0].id.startsWith("prod_"))).toHaveLength(2);
    expect((sent.at(-1)!.input.buttons as Array<{ id: string }>).some((b) => b.id.startsWith("cat_more_"))).toBe(false);
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
    expect((sent[1].input.buttons as Array<{ id: string; title: string }>).map((b) => b.title)).toEqual(["تقديم طلب", "كل المنتجات", "التحدث مع موظف"]);
    expect((sent[1].input.buttons as Array<{ id: string }>)[0].id).toBe(`buy_${product.id}`);

    await saveCatalogSettings(tenantId, { paymentEnabled: true, gatewaySecretKey: "sk_test_abcdefghijklmnop1234" });
    sent.length = 0;
    await handleCatalogReply(c, { id: `prod_${product.id}`, text: "" }, "");
    expect(sent[0].kind).toBe("buttons");
    expect((sent[0].input.buttons as Array<{ id: string; title: string }>)[0]).toMatchObject({ id: `buy_${product.id}` });
  });
});
