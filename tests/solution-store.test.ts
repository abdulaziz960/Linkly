import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-solution-store.db");

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

describe("solution guide text format", () => {
  it("reads sections, an untitled opening, and checklist items, and writes the built-in guides back unchanged", async () => {
    const { parseSections, sectionsToText, parseChecklist } = await import("../lib/solution-store");
    expect(parseSections("مقدمة قصيرة\n\n## قسم أول\nفقرة أولى\n\nفقرة ثانية\n\n## قسم ثانٍ\nنص")).toEqual([
      { title: "", paragraphs: ["مقدمة قصيرة"] },
      { title: "قسم أول", paragraphs: ["فقرة أولى", "فقرة ثانية"] },
      { title: "قسم ثانٍ", paragraphs: ["نص"] }
    ]);
    expect(parseChecklist("- رقم واتساب\n* ساعات العمل\n\nمستخدمون")).toEqual(["رقم واتساب", "ساعات العمل", "مستخدمون"]);
    const { solutions } = await import("../lib/solution-content");
    for (const guide of solutions) {
      expect(parseSections(sectionsToText(guide.ar.sections)), guide.slug).toEqual(guide.ar.sections);
      expect(parseSections(sectionsToText(guide.en!.sections)), guide.slug).toEqual(guide.en!.sections);
    }
  });

  it("checks the input: slug, Arabic text, and an English version that is complete or absent", async () => {
    const { cleanSolutionInput } = await import("../lib/solution-store");
    const base = { slug: "Whatsapp For Pharmacies", titleAr: "واتساب للصيدليات", descriptionAr: "وصف", bodyAr: "## قسم\nنص" };
    expect(cleanSolutionInput(base)).toMatchObject({ ok: true, data: { slug: "whatsapp-for-pharmacies", published: true } });
    expect(cleanSolutionInput({ ...base, slug: "" }).ok).toBe(false);
    expect(cleanSolutionInput({ ...base, bodyAr: "   " }).ok).toBe(false);
    expect(cleanSolutionInput({ ...base, titleAr: "" }).ok).toBe(false);
    expect(cleanSolutionInput({ ...base, titleEn: "Only a title" }).ok).toBe(false);
    expect(cleanSolutionInput({ ...base, titleEn: "T", descriptionEn: "D", bodyEn: "## S\nbody" }).ok).toBe(true);
  });
});

describe("solution guides managed from the admin panel", () => {
  it("shows the built-in guides until one is saved, then copies them in and serves what is saved", async () => {
    const store = await import("../lib/solution-store");
    const { solutions, localizedSolutions } = await import("../lib/solution-content");
    expect((await store.getPublicSolutions()).map((guide) => guide.slug)).toEqual(solutions.map((guide) => guide.slug));

    await store.seedDefaultSolutionsIfEmpty();
    const seeded = await store.listAdminSolutions();
    expect(seeded).toHaveLength(solutions.length);
    expect(seeded.map((row) => row.slug)).toEqual(solutions.map((guide) => guide.slug));
    store.clearSolutionCache();
    expect((await store.getPublicSolutions()).map((guide) => guide.slug)).toEqual(solutions.map((guide) => guide.slug));

    const cleaned = store.cleanSolutionInput({ slug: "pharmacies", titleAr: "واتساب للصيدليات", descriptionAr: "استقبال الطلبات", bodyAr: "## الطلبات\nتنظيم الطلبات [الأسعار](/pricing)", checklistAr: "رقم واتساب\nساعات العمل" });
    if (!cleaned.ok) throw new Error(cleaned.error);
    const created = await store.createSolution(cleaned.data);
    if (!created.ok) throw new Error(created.error);
    expect((await store.createSolution(cleaned.data))).toMatchObject({ ok: false, status: 409 });

    const guide = (await store.getPublicSolution("pharmacies"))!;
    expect(guide.ar.sections).toEqual([{ title: "الطلبات", paragraphs: ["تنظيم الطلبات [الأسعار](/pricing)"] }]);
    expect(guide.ar.checklist).toEqual(["رقم واتساب", "ساعات العمل"]);
    expect(guide.en).toBeNull();
    // No English version: it is listed in Arabic only.
    expect(localizedSolutions(await store.getPublicSolutions(), "ar").map((item) => item.slug)).toContain("pharmacies");
    expect(localizedSolutions(await store.getPublicSolutions(), "en").map((item) => item.slug)).not.toContain("pharmacies");

    const edited = store.cleanSolutionInput({ ...cleaned.data, titleEn: "WhatsApp for pharmacies", descriptionEn: "Orders", bodyEn: "## Orders\nHandle orders", published: false });
    if (!edited.ok) throw new Error(edited.error);
    expect((await store.updateSolution(created.solution.id, edited.data)).ok).toBe(true);
    expect(await store.getPublicSolution("pharmacies")).toBeNull(); // hidden
    expect((await store.updateSolution(created.solution.id, { ...edited.data, published: true })).ok).toBe(true);
    expect((await store.getPublicSolution("pharmacies"))!.en?.title).toBe("WhatsApp for pharmacies");

    expect(await store.deleteSolution(created.solution.id)).toBe(true);
    expect(await store.getPublicSolution("pharmacies")).toBeNull();
    expect(await store.deleteSolution(created.solution.id)).toBe(false);
  });

  it("puts a new guide in the sitemap, the page-SEO list and the link picker, and keeps a hidden one out", async () => {
    const store = await import("../lib/solution-store");
    const cleaned = store.cleanSolutionInput({ slug: "cars", titleAr: "واتساب لمعارض السيارات", descriptionAr: "وصف", bodyAr: "## قسم\nنص", titleEn: "WhatsApp for car dealers", descriptionEn: "d", bodyEn: "## S\nb" });
    if (!cleaned.ok) throw new Error(cleaned.error);
    const created = await store.createSolution(cleaned.data);
    if (!created.ok) throw new Error(created.error);

    const sitemap = (await import("../app/sitemap")).default;
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://linklysa.io/solutions/cars");
    expect(urls).toContain("https://linklysa.io/en/solutions/cars");

    const { editablePages, cleanPageSeoInput } = await import("../lib/page-seo");
    const pages = await editablePages();
    expect(pages.map((page) => page.path)).toEqual(expect.arrayContaining(["/solutions/cars", "/en/solutions/cars"]));
    expect(cleanPageSeoInput("/solutions/cars", { metaTitle: "عنوان" }, pages).ok).toBe(true);
    expect((await (await import("../lib/blog-links")).siteLinkSuggestions("ar")).map((link) => link.path)).toContain("/solutions/cars");

    await store.updateSolution(created.solution.id, { ...cleaned.data, published: false });
    const hidden = (await sitemap()).map((entry) => entry.url);
    expect(hidden).not.toContain("https://linklysa.io/solutions/cars");
    expect((await editablePages()).map((page) => page.path)).not.toContain("/solutions/cars");
  });
});

describe("the search title and description of a guide", () => {
  it("keeps every built-in guide's snippet within what search results show, in both languages", async () => {
    const { solutions, solutionSeo } = await import("../lib/solution-content");
    for (const guide of solutions) {
      for (const lang of ["ar", "en"] as const) {
        const seo = solutionSeo(guide[lang]!);
        expect(seo.title.length, `${guide.slug} ${lang} title`).toBeLessThanOrEqual(62);
        expect(seo.title.endsWith(" | Linkly")).toBe(true);
        expect(seo.description.length, `${guide.slug} ${lang} description`).toBeLessThanOrEqual(165);
        expect(seo.description.length, `${guide.slug} ${lang} description`).toBeGreaterThanOrEqual(70);
      }
    }
  });

  it("leaves a short title and description as they are, and cuts a long one at a colon or the last whole word or sentence", async () => {
    const { solutionSeo } = await import("../lib/solution-content");
    expect(solutionSeo({ title: "Short guide", description: "A short description." })).toEqual({ title: "Short guide | Linkly", description: "A short description." });
    expect(solutionSeo({ title: "WhatsApp for clinics and health centers: organized patient inquiries", description: "x" }).title).toBe("WhatsApp for clinics and health centers | Linkly");
    const noColon = solutionSeo({ title: "WhatsApp Business campaigns with approved templates and clear results", description: "x" }).title;
    expect(noColon.length).toBeLessThanOrEqual(62);
    expect(noColon).toMatch(/^WhatsApp Business campaigns with approved templates/);
    // A long description ends at the last full sentence that fits; one long sentence ends at its last comma that fits.
    const twoSentences = "How a restaurant can organize WhatsApp: an auto reply for hours and location, conversations routed to the right branch, and campaigns for offers. Try Linkly free today and see.";
    expect(solutionSeo({ title: "T", description: twoSentences }).description).toBe("How a restaurant can organize WhatsApp: an auto reply for hours and location, conversations routed to the right branch, and campaigns for offers.");
    const oneSentence = "How your clinic can organize patient inquiries on WhatsApp: a shared inbox for the reception team, an auto reply outside hours, and permissions that decide who sees what. Try Linkly free.";
    expect(solutionSeo({ title: "T", description: oneSentence }).description).toBe("How your clinic can organize patient inquiries on WhatsApp: a shared inbox for the reception team, an auto reply outside hours.");
  });
});
