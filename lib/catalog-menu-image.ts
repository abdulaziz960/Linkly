// The picture of the whole menu a restaurant uploads: sent to the customer when they open the catalog, above the list of
// items and prices. Kept like the product photos: a resized JPEG data URL, served from a public .jpg address for WhatsApp.

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

export const MAX_MENU_IMAGE_BYTES = 1500 * 1024;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Pure: a JPEG data URL into its bytes, or an Arabic error. */
export function parseMenuImage(dataUrl: unknown): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const match = typeof dataUrl === "string" ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!match) return { ok: false, error: "الصورة غير صالحة. اختر صورة JPG أو PNG أو WebP." };
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 200 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { ok: false, error: "الصورة غير صالحة." };
  if (bytes.length > MAX_MENU_IMAGE_BYTES) return { ok: false, error: "حجم الصورة كبير. اختر صورة أصغر." };
  return { ok: true, bytes };
}

/** The public address of the menu picture; the version changes with every upload so old copies are not shown. */
export function menuImageUrl(origin: string, tenantId: string, version: string | number): string {
  return `${origin.replace(/\/$/, "")}/api/catalog/menu-image/${encodeURIComponent(tenantId)}.jpg?v=${encodeURIComponent(String(version))}`;
}

export async function saveMenuImage(tenantId: string, dataUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseMenuImage(dataUrl);
  if (!parsed.ok) return parsed;
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_menu_images WHERE tenant_id = ${tenantId}`;
  await prisma.$executeRaw`INSERT INTO catalog_menu_images (tenant_id, data_url, updated_at) VALUES (${tenantId}, ${dataUrl}, ${new Date().toISOString()})`;
  return { ok: true };
}

/** When the picture was last saved (its version), or null when there is none. */
export async function getMenuImageVersion(tenantId: string): Promise<string | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ updated_at: string }>>`SELECT updated_at FROM catalog_menu_images WHERE tenant_id = ${tenantId} LIMIT 1`;
  return rows[0] ? String(Date.parse(rows[0].updated_at) || 1) : null;
}

export async function getMenuImage(tenantId: string): Promise<Buffer | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ data_url: string }>>`SELECT data_url FROM catalog_menu_images WHERE tenant_id = ${tenantId} LIMIT 1`;
  const parsed = rows[0] ? parseMenuImage(rows[0].data_url) : null;
  return parsed?.ok ? parsed.bytes : null;
}

export async function removeMenuImage(tenantId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_menu_images WHERE tenant_id = ${tenantId}`;
}
