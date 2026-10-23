// The English name of a catalog product, kept apart from the product (which has one name): the dashboard shows it when it is in English.

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

export function cleanEnglishName(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

export async function setProductNameEn(tenantId: string, productId: string, nameEn: unknown) {
  await ensureTables();
  const name = cleanEnglishName(nameEn);
  await prisma.$executeRaw`DELETE FROM catalog_product_names_en WHERE product_id = ${productId} AND tenant_id = ${tenantId}`;
  if (name) await prisma.$executeRaw`INSERT INTO catalog_product_names_en (product_id, tenant_id, name_en) VALUES (${productId}, ${tenantId}, ${name})`;
}

export async function getProductNamesEn(tenantId: string, productIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return result;
  await ensureTables();
  const { Prisma } = await import("@prisma/client");
  for (let start = 0; start < ids.length; start += 200) {
    const batch = ids.slice(start, start + 200);
    const rows = await prisma.$queryRaw<Array<{ product_id: string; name_en: string }>>`SELECT product_id, name_en FROM catalog_product_names_en WHERE tenant_id = ${tenantId} AND product_id IN (${Prisma.join(batch)})`;
    for (const row of rows) result.set(row.product_id, row.name_en);
  }
  return result;
}
