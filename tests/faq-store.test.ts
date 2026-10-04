import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-faq-store.db");

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

describe("FAQ managed from the admin panel", () => {
  it("shows the built-in questions until the admin configures anything", async () => {
    const { getFaqs, clearFaqCache } = await import("../lib/faq-store");
    const { faqsAr, faqsEn } = await import("../lib/faq");
    clearFaqCache();
    expect((await getFaqs("ar")).length).toBe(faqsAr.length);
    expect((await getFaqs("en"))[0][0]).toBe(faqsEn[0][0]);
  });

  it("seeds the defaults once so they can be edited, then serves the edited, ordered, active ones", async () => {
    const { seedDefaultFaqsIfEmpty, listFaqItems, createFaqItem, updateFaqItem, deleteFaqItem, reorderFaqItems, getFaqs, clearFaqCache } = await import("../lib/faq-store");
    const { faqsAr } = await import("../lib/faq");

    await seedDefaultFaqsIfEmpty();
    await seedDefaultFaqsIfEmpty();
    let items = await listFaqItems();
    expect(items).toHaveLength(faqsAr.length);

    const created = await createFaqItem({ questionAr: "سؤال جديد؟", answerAr: "جواب جديد", questionEn: "", answerEn: "", active: true });
    expect(created?.sortOrder).toBe(faqsAr.length);

    // Hide one, edit one, delete one, move the new one first.
    await updateFaqItem(items[0].id, { questionAr: items[0].questionAr, answerAr: items[0].answerAr, questionEn: items[0].questionEn, answerEn: items[0].answerEn, active: false });
    await updateFaqItem(items[1].id, { questionAr: "معدّل", answerAr: "جواب معدّل", questionEn: "Edited", answerEn: "Edited answer", active: true });
    await deleteFaqItem(items[2].id);
    await reorderFaqItems([created!.id]);
    clearFaqCache();

    const ar = await getFaqs("ar");
    expect(ar[0]).toEqual(["سؤال جديد؟", "جواب جديد"]);
    expect(ar.map((pair) => pair[0])).toContain("معدّل");
    expect(ar.map((pair) => pair[0])).not.toContain(items[0].questionAr);
    expect(ar.map((pair) => pair[0])).not.toContain(items[2].questionAr);
    // English falls back to the Arabic text when no English version was written.
    const en = await getFaqs("en");
    expect(en[0]).toEqual(["سؤال جديد؟", "جواب جديد"]);
    expect(en.map((pair) => pair[0])).toContain("Edited");

    items = await listFaqItems();
    expect(items).toHaveLength(faqsAr.length + 1 - 1);
  });

  it("validates the input", async () => {
    const { cleanFaqInput } = await import("../lib/faq-store");
    expect(cleanFaqInput({ questionAr: "", answerAr: "x" }).ok).toBe(false);
    expect(cleanFaqInput({ questionAr: "س", answerAr: "ج", questionEn: "Q" }).ok).toBe(false);
    expect(cleanFaqInput({ questionAr: "س", answerAr: "ج" }).ok).toBe(true);
  });

  it("keeps the admin API for platform admins only", async () => {
    vi.resetModules();
    vi.doMock("../lib/admin-auth", () => ({ requirePlatformAdmin: async () => null }));
    const { POST } = await import("../app/api/admin/faq/route");
    const response = await POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ questionAr: "س", answerAr: "ج" }) }) as never);
    expect(response.status).toBe(403);
    vi.doUnmock("../lib/admin-auth");
  });
});
