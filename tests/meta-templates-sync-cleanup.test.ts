import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-meta-templates-sync.db");
const TENANT_ID = "tenant-meta-templates-sync-test";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("syncMetaTemplates removes local templates deleted on Meta's side", () => {
  it("deletes a previously-synced template that no longer comes back from Meta, keeps a still-present one, and never touches an unsubmitted draft", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    await prisma.template.create({
      data: {
        id: "tmpl-deleted", tenantId: TENANT_ID, name: "deleted_on_meta", message: "old", type: "MARKETING",
        category: "MARKETING", language: "ar", status: "معتمد", headerType: "NONE", headerText: "", headerMedia: "",
        footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "", metaId: "meta-1",
        syncedAt: "قديم", lastUsed: "-"
      }
    });
    await prisma.template.create({
      data: {
        id: "tmpl-draft", tenantId: TENANT_ID, name: "local_draft", message: "draft", type: "MARKETING",
        category: "MARKETING", language: "ar", status: "قيد المراجعة", headerType: "NONE", headerText: "", headerMedia: "",
        footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "", metaId: "",
        syncedAt: "", lastUsed: "-"
      }
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "meta-2", name: "still_on_meta", status: "APPROVED", category: "MARKETING", language: "ar", components: [] }]
    }), { status: 200 })));

    const { syncMetaTemplates } = await import("../lib/meta-templates");
    const result = await syncMetaTemplates(TENANT_ID, "waba-1", "token-1");
    expect(result.ok).toBe(true);

    const remaining = await prisma.template.findMany({ where: { tenantId: TENANT_ID }, select: { name: true } });
    const names = remaining.map((row) => row.name).sort();
    expect(names).toEqual(["local_draft", "still_on_meta"]);
  });
});
