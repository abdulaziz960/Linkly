// Product photos the merchant uploads from the dashboard. The browser resizes the photo to a JPEG before sending; it is kept
// as a data URL in a lazy table and served from a public address ending in .jpg, which is what WhatsApp needs to show it.

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

export const MAX_PRODUCT_IMAGE_BYTES = 900 * 1024;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Pure: a JPEG data URL into its bytes, or an Arabic error. Only real JPEGs of a sane size pass. */
export function parseProductImage(dataUrl: unknown): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const match = typeof dataUrl === "string" ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!match) return { ok: false, error: "الصورة غير صالحة. اختر صورة JPG أو PNG أو WebP." };
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 200 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { ok: false, error: "الصورة غير صالحة." };
  if (bytes.length > MAX_PRODUCT_IMAGE_BYTES) return { ok: false, error: "حجم الصورة كبير. اختر صورة أصغر." };
  return { ok: true, bytes };
}

/** The public address of a product's uploaded photo (the version changes with every upload so old copies are not shown). */
export function productImageUrl(origin: string, productId: string, version: number): string {
  return `${origin.replace(/\/$/, "")}/api/catalog/product-image/${encodeURIComponent(productId)}.jpg?v=${version}`;
}

export async function saveProductImage(tenantId: string, productId: string, dataUrl: string): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const parsed = parseProductImage(dataUrl);
  if (!parsed.ok) return parsed;
  await ensureTables();
  const now = Date.now();
  await prisma.$executeRaw`DELETE FROM catalog_product_images WHERE product_id = ${productId}`;
  await prisma.$executeRaw`INSERT INTO catalog_product_images (product_id, tenant_id, data_url, updated_at) VALUES (${productId}, ${tenantId}, ${dataUrl}, ${new Date(now).toISOString()})`;
  return { ok: true, version: now };
}

export async function getProductImage(productId: string): Promise<Buffer | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ data_url: string }>>`SELECT data_url FROM catalog_product_images WHERE product_id = ${productId} LIMIT 1`;
  const parsed = rows[0] ? parseProductImage(rows[0].data_url) : null;
  return parsed?.ok ? parsed.bytes : null;
}

export async function removeProductImages(tenantId: string, productIds?: string[]) {
  await ensureTables();
  if (!productIds) {
    await prisma.$executeRaw`DELETE FROM catalog_product_images WHERE tenant_id = ${tenantId}`;
    return;
  }
  for (const id of productIds) await prisma.$executeRaw`DELETE FROM catalog_product_images WHERE tenant_id = ${tenantId} AND product_id = ${id}`;
}
