import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-categories.db");
const tenantId = "tenant-categories";

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

describe("catalog categories", () => {
  it("registers, lists with the ones products already use, and removes (clearing products)", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { createProduct, cleanProductInput } = await import("../lib/catalog");
    const { addCategory, listCategories, removeCategory, cleanCategoryName } = await import("../lib/catalog-categories");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();

    expect(cleanCategoryName("  وجبات   سريعة ")).toBe("وجبات سريعة");
    expect((await addCategory(tenantId, "  ")).ok).toBe(false);
    await addCategory(tenantId, "مشروبات");
    await addCategory(tenantId, "مشروبات");
    const clean = cleanProductInput({ name: "برجر", price: 20, category: "وجبات" });
    if (!clean.ok) throw new Error(clean.error);
    const product = await createProduct(tenantId, clean.data);
    expect(await listCategories(tenantId)).toEqual(["مشروبات", "وجبات"]);
    expect(await listCategories("other-tenant")).toEqual([]);

    await removeCategory(tenantId, "وجبات");
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.category).toBe("");
    expect(await listCategories(tenantId)).toEqual(["مشروبات"]);
  });
});
