import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-menu-image.db");
const tenantId = "tenant-menu-image";

const sent: Array<{ kind: string; input: Record<string, unknown> }> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "buttons", input }); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "cta", input }); return { ok: true }; }),
  sendWhatsAppRowList: vi.fn(async (input: Record<string, unknown>) => { sent.push({ kind: "list", input }); return { ok: true }; }),
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

const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400, 1)]).toString("base64")}`;

describe("the menu picture", () => {
  it("accepts only a real, not oversized JPEG", async () => {
    const { parseMenuImage } = await import("../lib/catalog-menu-image");
    expect(parseMenuImage(jpeg).ok).toBe(true);
    expect(parseMenuImage("data:image/png;base64,AAAA").ok).toBe(false);
    expect(parseMenuImage(`data:image/jpeg;base64,${Buffer.alloc(2_000_000, 1).toString("base64")}`).ok).toBe(false);
  });

  it("is sent first when the catalog opens, with the list under it, and not again on follow-up lists", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { createProduct, cleanProductInput } = await import("../lib/catalog");
    const clean = cleanProductInput({ name: "برجر", price: 25 });
    if (!clean.ok) throw new Error(clean.error);
    await createProduct(tenantId, clean.data);
    const { sendCatalogMenu } = await import("../lib/catalog-bot");
    const { saveMenuImage, getMenuImage, removeMenuImage, setMenuBusiness, getMenuBusiness } = await import("../lib/catalog-menu-image");
    const c = { channel: "whatsapp" as const, tenantId, conversationId: "conv-menu", recipientId: "966500000001", sendText: async () => undefined };

    sent.length = 0;
    await sendCatalogMenu(c, "أهلًا");
    expect(sent.map((x) => x.kind)).toEqual(["list", "buttons"].slice(0, sent.length));
    expect(sent.some((x) => x.kind === "image")).toBe(false);

    expect((await saveMenuImage(tenantId, jpeg)).ok).toBe(true);
    expect((await getMenuImage(tenantId))?.length).toBeGreaterThan(300);
    // without a chosen business type the picture is not used, even though one was uploaded
    sent.length = 0;
    await sendCatalogMenu(c, "أهلًا");
    expect(sent.some((x) => x.kind === "image")).toBe(false);
    expect(await setMenuBusiness(tenantId, "pharmacy")).toBe("");
    expect(await setMenuBusiness(tenantId, "cafe")).toBe("cafe");
    expect(await getMenuBusiness(tenantId)).toBe("cafe");
    sent.length = 0;
    await sendCatalogMenu(c, "أهلًا");
    expect(sent[0].kind).toBe("image");
    expect(String(sent[0].input.imageUrl)).toContain(`/api/catalog/menu-image/${tenantId}.jpg`);
    expect(sent[1].kind).toBe("list");

    sent.length = 0;
    await sendCatalogMenu(c, "اختر منتجًا:", 0, undefined, false);
    expect(sent.some((x) => x.kind === "image")).toBe(false);

    await removeMenuImage(tenantId);
    sent.length = 0;
    await sendCatalogMenu(c, "أهلًا");
    expect(sent.some((x) => x.kind === "image")).toBe(false);
  });
});
