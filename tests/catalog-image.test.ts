import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-image.db");
const tenantId = "tenant-catalog-image";

vi.mock("../lib/url-safety", () => ({ isPubliclyRoutableUrl: vi.fn(async (url: string) => !url.includes("private.local")) }));
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppIdButtons: vi.fn(async (input: Record<string, unknown>) => { sent.push(input); return { ok: true }; }),
  sendWhatsAppCtaUrl: vi.fn(async () => ({ ok: true }))
}));
const sent: Array<Record<string, unknown>> = [];

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function addProduct(imageUrl: string) {
  const { ensureSchema } = await import("../lib/database");
  const { createProduct, cleanProductInput } = await import("../lib/catalog");
  await ensureSchema();
  const clean = cleanProductInput({ name: "سيارة", price: 100, imageUrl });
  if (!clean.ok) throw new Error(clean.error);
  return createProduct(tenantId, clean.data);
}

describe("WhatsApp-safe product images", () => {
  it("routes WebP images through the JPEG converter and leaves JPEG/PNG direct", async () => {
    const webp = await addProduct("https://shop.example.com/uploads/car.webp");
    const jpg = await addProduct("https://shop.example.com/uploads/car.jpg?v=2");
    const { sendCatalogMenu } = await import("../lib/catalog-bot");
    sent.length = 0;
    await sendCatalogMenu({ channel: "whatsapp", tenantId, conversationId: "c", recipientId: "966500000000", sendText: async () => {} }, "hi");
    const urls = sent.map((m) => m.headerImageUrl).filter(Boolean) as string[];
    expect(urls.some((u) => u.includes(`/api/catalog/image/${webp.id}`))).toBe(true);
    expect(urls).toContain("https://shop.example.com/uploads/car.jpg?v=2");
    expect(jpg.id).toBeTruthy();
  });

  it("converts a WebP source to JPEG and refuses private addresses", async () => {
    const sharp = (await import("sharp")).default;
    const webpBuffer = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ff0000" } }).webp().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(webpBuffer), { status: 200, headers: { "content-type": "image/webp" } })));

    const product = await addProduct("https://shop.example.com/x.webp");
    const { GET } = await import("../app/api/catalog/image/[id]/route");
    const ok = await GET({} as never, { params: Promise.resolve({ id: product.id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(await ok.arrayBuffer())).metadata();
    expect(meta.format).toBe("jpeg");

    const blocked = await addProduct("https://private.local/x.webp");
    const denied = await GET({} as never, { params: Promise.resolve({ id: blocked.id }) });
    expect(denied.status).toBe(404);
    const missing = await GET({} as never, { params: Promise.resolve({ id: "nope" }) });
    expect(missing.status).toBe(404);
  });
});
