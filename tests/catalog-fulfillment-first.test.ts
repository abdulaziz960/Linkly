import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-fulfillment-first.db");
const tenantId = "tenant-fulfillment-first";

const sent: Array<{ kind: string; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "list", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async () => ({ ok: true })),
  sendWhatsAppImageByUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "image", input }); return { ok: true }; })
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

const ids = (index = -1) => {
  const message = sent.at(index)!;
  const items = (message.kind === "buttons" ? message.input.buttons : message.input.rows) as Array<{ id: string }>;
  return items.map((item) => item.id);
};

describe("delivery or pickup is asked first", () => {
  it("asks it when the catalog opens, then the branch, the menu picture and the list; checkout does not ask again", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { prisma } = await import("../lib/prisma");
    const { createProduct, cleanProductInput } = await import("../lib/catalog");
    const { createShippingMethod } = await import("../lib/catalog-shipping");
    const { savePickupSettings } = await import("../lib/catalog-pickup");
    const { saveMenuImage, setMenuBusiness } = await import("../lib/catalog-menu-image");
    const { ensureBranchesSchema } = await import("../lib/branches-schema");
    const { addToCart } = await import("../lib/catalog-cart");
    const { sendCatalogMenu, handleCatalogReply } = await import("../lib/catalog-bot");

    const clean = cleanProductInput({ name: "قهوة", price: 12 });
    if (!clean.ok) throw new Error(clean.error);
    const product = await createProduct(tenantId, clean.data);
    expect((await createShippingMethod(tenantId, { name: "توصيل", price: 10, cities: [] })).ok).toBe(true);
    await savePickupSettings(tenantId, { enabled: true, inStore: true, curbside: false });
    await ensureBranchesSchema();
    const now = new Date().toISOString();
    for (const [id, name] of [["ff-1", "فرع الشمال"], ["ff-2", "فرع الجنوب"]]) {
      await prisma.$executeRaw`INSERT INTO branches (id, tenant_id, name, latitude, longitude, active, created_at, updated_at) VALUES (${id}, ${tenantId}, ${name}, 24.7, 46.6, 1, ${now}, ${now})`;
    }
    await setMenuBusiness(tenantId, "cafe");
    await saveMenuImage(tenantId, `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400, 1)]).toString("base64")}`);
    await prisma.customer.create({ data: { id: "cust-ff", name: "سارة", phone: "966500000222", initial: "س", tenantId } });
    await prisma.conversation.create({ data: { id: "conv-ff", customerId: "cust-ff", channel: "whatsapp", lastMessage: "x", status: "closed", assignee: "بدون موظف", lastActivityAt: now, tenantId } });
    const c = { channel: "whatsapp" as const, tenantId, conversationId: "conv-ff", recipientId: "966500000222", sendText: async () => undefined };

    // 1. the first question is delivery or pickup
    sent.length = 0;
    await sendCatalogMenu(c, "");
    expect(sent).toHaveLength(1);
    expect(ids()).toEqual(["ful_delivery", "ful_pickup"]);

    // 2. pickup -> which branch
    sent.length = 0;
    await handleCatalogReply(c, { id: "ful_pickup", text: "" }, "");
    expect(String(sent.at(-1)!.input.bodyText)).toContain("من أي فرع");
    expect(ids()).toEqual(["br_ff-1", "br_ff-2"]);

    // 3. a branch -> the menu picture, then the list
    sent.length = 0;
    await handleCatalogReply(c, { id: "br_ff-1", text: "" }, "");
    expect(sent[0].kind).toBe("image");
    expect(sent[1].kind).toBe("list");

    // 4. at checkout the choice is remembered: straight to the pickup questions, no delivery/pickup question again
    await addToCart(tenantId, "conv-ff", product.id, 1);
    sent.length = 0;
    await handleCatalogReply(c, { id: "cart_pay", text: "" }, "");
    expect(sent.some((x) => x.kind === "buttons" && ids(sent.indexOf(x)).includes("ful_delivery"))).toBe(false);
  });
});
