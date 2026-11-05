import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dbPath = join(process.cwd(), "tests", ".tmp-product-image-route.db");
const PRODUCT_ID = "prod_route_123456";

beforeAll(async () => {
  if (existsSync(dbPath)) unlinkSync(dbPath);
  vi.stubEnv("DATABASE_URL", `file:${dbPath}`);
  vi.stubEnv("AUTH_SECRET", "route-test-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const raw = Buffer.alloc(900 * 900 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31) % 251;
  const jpeg = await sharp(raw, { raw: { width: 900, height: 900, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  const { saveProductImage } = await import("../lib/catalog-product-image");
  const saved = await saveProductImage("tenant-route", PRODUCT_ID, `data:image/jpeg;base64,${jpeg.toString("base64")}`);
  expect(saved.ok).toBe(true);
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
});

async function get(query: string) {
  const { GET } = await import("../app/api/catalog/product-image/[file]/route");
  const request = new NextRequest(`http://localhost/api/catalog/product-image/${PRODUCT_ID}.jpg${query}`);
  return GET(request, { params: Promise.resolve({ file: `${PRODUCT_ID}.jpg` }) });
}

describe("product photo endpoint", () => {
  it("serves the full photo by default (WhatsApp needs it)", async () => {
    const response = await get("?v=1");
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect((await sharp(bytes).metadata()).width).toBe(900);
  });

  it("serves a small copy for ?w=96, still a cacheable JPEG", async () => {
    const full = Buffer.from(await (await get("?v=1")).arrayBuffer());
    const response = await get("?v=1&w=96");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("max-age");
    const thumb = Buffer.from(await response.arrayBuffer());
    expect((await sharp(thumb).metadata()).width).toBe(96);
    expect(thumb.length).toBeLessThan(full.length / 10);
  });

  it("ignores widths it does not offer (no arbitrary resizing work)", async () => {
    const bytes = Buffer.from(await (await get("?w=5000")).arrayBuffer());
    expect((await sharp(bytes).metadata()).width).toBe(900);
  });

  it("answers 404 for a product without a photo", async () => {
    const { GET } = await import("../app/api/catalog/product-image/[file]/route");
    const response = await GET(new NextRequest("http://localhost/api/catalog/product-image/prod_missing_1.jpg"), { params: Promise.resolve({ file: "prod_missing_1.jpg" }) });
    expect(response.status).toBe(404);
  });
});
