import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LEGAL_SLUGS, builtInLegalPages } from "../lib/legal-content";
import { legalPlainText, parseLegalBody } from "../lib/legal-body";

const testDbPath = join(process.cwd(), "tests", ".tmp-legal-pages.db");

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

describe("the built-in text of the legal pages", () => {
  // The fixtures are the text the pages showed when they were written in code: moving them into the admin panel must not change a word.
  for (const slug of LEGAL_SLUGS) {
    for (const lang of ["ar", "en"] as const) {
      it(`${slug} (${lang}) says exactly what the page said before it became editable`, () => {
        const fixture = readFileSync(join(process.cwd(), "tests", "fixtures", "legal", `${slug}-${lang}.txt`), "utf-8").trim();
        expect(`Linkly ${legalPlainText(builtInLegalPages[slug][lang])}`).toBe(fixture);
      });
    }
  }
});

describe("the legal page text format", () => {
  it("reads headings, paragraphs, bullets, numbered steps, links and the contact box", () => {
    const blocks = parseLegalBody("مقدمة\nمن سطرين\n\n## عنوان\n- أ\n- ب\n\n1. خطوة\n2. أخرى\n\n### فرعي\nفقرة [رابط](/privacy)\n\n> للتواصل\n> info@example.com");
    expect(blocks).toEqual([
      { type: "p", text: "مقدمة من سطرين" },
      { type: "h2", text: "عنوان" },
      { type: "ul", items: ["أ", "ب"] },
      { type: "ol", items: ["خطوة", "أخرى"] },
      { type: "h3", text: "فرعي" },
      { type: "p", text: "فقرة [رابط](/privacy)" },
      { type: "callout", paragraphs: ["للتواصل", "info@example.com"] }
    ]);
    // A blank line closes a list: two bullets apart are two lists.
    expect(parseLegalBody("- أ\n\n- ب")).toEqual([{ type: "ul", items: ["أ"] }, { type: "ul", items: ["ب"] }]);
  });
});

describe("legal pages edited from the admin panel", () => {
  it("shows the built-in text until a page is saved, then what is saved (a blank field keeps the built-in text), and can be reset", async () => {
    const store = await import("../lib/legal-store");
    const built = builtInLegalPages.terms;
    expect((await store.getLegalPage("terms")).ar.title).toBe(built.ar.title);
    expect((await store.listAdminLegalPages()).map((row) => [row.slug, row.customized])).toEqual([["privacy", false], ["terms", false], ["data-deletion", false]]);

    const cleaned = store.cleanLegalInput("terms", { titleAr: "شروط الاستخدام المحدثة", updatedAr: "آخر تحديث: اليوم", bodyAr: "## بند\nنص جديد", titleEn: "Updated terms", updatedEn: "", bodyEn: "## Clause\nNew text" });
    if (!cleaned.ok) throw new Error(cleaned.error);
    await store.saveLegalPage(cleaned.slug, cleaned.data);
    const page = await store.getLegalPage("terms");
    expect(page.ar).toEqual({ title: "شروط الاستخدام المحدثة", updated: "آخر تحديث: اليوم", body: "## بند\nنص جديد" });
    expect(page.en.title).toBe("Updated terms");
    expect(page.en.updated).toBe(built.en.updated); // left empty: the built-in line stays
    expect((await store.listAdminLegalPages()).find((row) => row.slug === "terms")?.customized).toBe(true);
    expect((await store.getLegalPage("privacy")).ar.title).toBe(builtInLegalPages.privacy.ar.title); // other pages untouched

    await store.resetLegalPage("terms");
    expect((await store.getLegalPage("terms")).ar.title).toBe(built.ar.title);
  });

  it("refuses an unknown page and a page without its Arabic or English title and text", async () => {
    const { cleanLegalInput } = await import("../lib/legal-store");
    const ok = { titleAr: "ع", bodyAr: "ن", titleEn: "T", bodyEn: "b" };
    expect(cleanLegalInput("cookies", ok).ok).toBe(false);
    expect(cleanLegalInput("terms", ok).ok).toBe(true);
    expect(cleanLegalInput("terms", { ...ok, titleAr: "" }).ok).toBe(false);
    expect(cleanLegalInput("terms", { ...ok, bodyEn: "  " }).ok).toBe(false);
  });
});
