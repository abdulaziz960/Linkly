import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-knowledge-base.db");
const tenantId = "tenant-knowledge-base-test";

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

describe("KB entry CRUD", () => {
  it("creates, lists, updates, and deletes an entry, scoped to the tenant", async () => {
    const { createKbEntry, listKbEntries, updateKbEntry, deleteKbEntry } = await import("../lib/knowledge-base");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const created = await createKbEntry(tenantId, { question: "كم سعر الاشتراك؟", answer: "يبدأ من 100 ريال شهرياً" });
    expect(created.question).toBe("كم سعر الاشتراك؟");

    const listed = await listKbEntries(tenantId);
    expect(listed.some((entry) => entry.id === created.id)).toBe(true);

    const updated = await updateKbEntry(tenantId, created.id, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 120 ريال شهرياً" });
    expect(updated?.answer).toBe("يبدأ من 120 ريال شهرياً");

    const deleted = await deleteKbEntry(tenantId, created.id);
    expect(deleted).toBe(true);
    expect((await listKbEntries(tenantId)).some((entry) => entry.id === created.id)).toBe(false);
  });

  it("never returns or mutates another tenant's entry", async () => {
    const { createKbEntry, listKbEntries, updateKbEntry, deleteKbEntry } = await import("../lib/knowledge-base");

    const created = await createKbEntry("tenant-kb-other", { question: "سؤال", answer: "جواب" });

    expect(await listKbEntries(tenantId)).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    expect(await updateKbEntry(tenantId, created.id, { question: "x", answer: "y" })).toBeNull();
    expect(await deleteKbEntry(tenantId, created.id)).toBe(false);
  });
});

describe("findBestKbMatch", () => {
  it("returns the correct entry for a near-wording match", async () => {
    const { createKbEntry, findBestKbMatch } = await import("../lib/knowledge-base");

    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 100 ريال شهرياً" });
    await createKbEntry(tenantId, { question: "هل تدعمون الدفع بالتقسيط؟", answer: "نعم، عبر تمارا وتابي" });

    const match = await findBestKbMatch(tenantId, "وش سعر الاشتراك بالشهر؟");
    expect(match?.answer).toBe("يبدأ من 100 ريال شهرياً");
  });

  it("returns null for text unrelated to any entry", async () => {
    const { findBestKbMatch } = await import("../lib/knowledge-base");
    const match = await findBestKbMatch(tenantId, "أبغى أشتكي على تأخر التوصيل جداً");
    expect(match).toBeNull();
  });

  it("matches against the answer for a pasted-text entry with no question", async () => {
    const { createKbEntry, findBestKbMatch } = await import("../lib/knowledge-base");

    await createKbEntry(tenantId, { question: "", answer: "ساعات العمل من الأحد إلى الخميس، من الساعة 9 صباحاً إلى 5 مساءً" });

    const match = await findBestKbMatch(tenantId, "ساعات العمل من الأحد للخميس من 9 صباحاً إلى 5 مساءً");
    expect(match?.question).toBe("");
    expect(match?.answer).toContain("ساعات العمل");
  });

  it("returns null when the tenant has no entries", async () => {
    const { findBestKbMatch } = await import("../lib/knowledge-base");
    const match = await findBestKbMatch("tenant-kb-empty", "أي سؤال");
    expect(match).toBeNull();
  });
});
