import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-catalog-template.db");

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

describe("catalog templates", () => {
  it("recognises the tapped button of a catalog_ template only", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { prisma } = await import("../lib/prisma");
    const { isCatalogTemplateButton } = await import("../lib/catalog-template");
    const { isCatalogTemplateName } = await import("../lib/catalog-template-shared");
    const base = { message: "m", type: "تسويق", category: "MARKETING", language: "ar", status: "معتمد", lastUsed: "-" };
    await prisma.template.create({ data: { ...base, id: "t1", tenantId: "ten-a", name: "catalog_spring", buttonType: "QUICK_REPLY", buttonText: "تصفح المنتجات" } });
    await prisma.template.create({ data: { ...base, id: "t2", tenantId: "ten-a", name: "welcome", buttonType: "QUICK_REPLY", buttonText: "ابدأ" } });

    expect(isCatalogTemplateName("catalog_spring")).toBe(true);
    expect(isCatalogTemplateName("welcome")).toBe(false);
    expect(await isCatalogTemplateButton("ten-a", "تصفح المنتجات")).toBe(true);
    expect(await isCatalogTemplateButton("ten-a", "ابدأ")).toBe(false);
    expect(await isCatalogTemplateButton("ten-b", "تصفح المنتجات")).toBe(false);
    expect(await isCatalogTemplateButton("ten-a", "")).toBe(false);
  });
});
