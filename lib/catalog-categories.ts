// Categories the merchant registers once and then picks from in the product form (and the bot lists them as sections).

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export function cleanCategoryName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

/** Registered categories plus any a product already carries (older products and synced ones), alphabetically. */
export async function listCategories(tenantId: string): Promise<string[]> {
  await ensureTables();
  const registered = await prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM catalog_categories WHERE tenant_id = ${tenantId}`;
  const used = await prisma.product.groupBy({ by: ["category"], where: { tenantId } });
  const names = new Set([...registered.map((row) => row.name), ...used.map((row) => row.category)].filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b, "ar"));
}

export async function addCategory(tenantId: string, name: unknown): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const clean = cleanCategoryName(name);
  if (!clean) return { ok: false, error: "اكتب اسم التصنيف" };
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_categories WHERE tenant_id = ${tenantId} AND name = ${clean}`;
  await prisma.$executeRaw`INSERT INTO catalog_categories (tenant_id, name, created_at) VALUES (${tenantId}, ${clean}, ${new Date().toISOString()})`;
  return { ok: true, name: clean };
}

/** Removes a category; products that carried it become uncategorised. */
export async function removeCategory(tenantId: string, name: unknown) {
  const clean = cleanCategoryName(name);
  if (!clean) return;
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_categories WHERE tenant_id = ${tenantId} AND name = ${clean}`;
  await prisma.product.updateMany({ where: { tenantId, category: clean }, data: { category: "", updatedAt: new Date().toISOString() } });
}
