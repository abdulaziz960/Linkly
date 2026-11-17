import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { solutions as builtInSolutions, type Solution, type SolutionLocale } from "./solution-content";
import { normalizeSlug } from "./blog-store";

/**
 * Solution guides (/solutions/<slug>), managed from the admin panel. While nobody has added or edited a guide, the built-in ones in
 * lib/solution-content.ts are shown; the first time the admin page is opened they are copied into the table so they can be edited.
 *
 * A body is plain text: a line starting with "## " opens a section, and text separated by blank lines is a paragraph (text before the
 * first heading is an untitled opening section). A checklist is one item per line. A link is [text](/path) like in the blog.
 */

export const SOLUTION_LIMITS = { title: 200, description: 400, body: 20000, checklist: 3000, guides: 100 };

type Section = SolutionLocale["sections"][number];

export function parseSections(body: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    const text = paragraph.join("\n").trim();
    if (text) {
      current ??= { title: "", paragraphs: [] };
      current.paragraphs.push(text);
    }
    paragraph = [];
  };
  const close = () => {
    flush();
    if (current && (current.title || current.paragraphs.length)) sections.push(current);
    current = null;
  };
  for (const line of body.replace(/\r/g, "").split("\n")) {
    if (line.startsWith("## ")) {
      close();
      current = { title: line.slice(3).trim(), paragraphs: [] };
    } else if (!line.trim()) {
      flush();
    } else {
      paragraph.push(line.trimEnd());
    }
  }
  close();
  return sections;
}

export function sectionsToText(sections: Section[]): string {
  return sections.map((section) => [section.title ? `## ${section.title}` : "", ...section.paragraphs].filter(Boolean).join("\n\n")).join("\n\n");
}

export function parseChecklist(text: string): string[] {
  return text.replace(/\r/g, "").split("\n").map((line) => line.trim().replace(/^[-*•]\s+/, "")).filter(Boolean);
}

export const checklistToText = (items: string[]) => items.join("\n");

export type SolutionAdminRow = {
  id: string; slug: string; sortOrder: number; published: boolean;
  titleAr: string; descriptionAr: string; bodyAr: string; checklistAr: string;
  titleEn: string; descriptionEn: string; bodyEn: string; checklistEn: string;
};

type Row = { id: string; slug: string; sortOrder: number; published: number; titleAr: string; descriptionAr: string; bodyAr: string; checklistAr: string; titleEn: string; descriptionEn: string; bodyEn: string; checklistEn: string };

function toAdminRow(row: Row): SolutionAdminRow {
  return { id: row.id, slug: row.slug, sortOrder: row.sortOrder, published: row.published === 1, titleAr: row.titleAr, descriptionAr: row.descriptionAr, bodyAr: row.bodyAr, checklistAr: row.checklistAr, titleEn: row.titleEn, descriptionEn: row.descriptionEn, bodyEn: row.bodyEn, checklistEn: row.checklistEn };
}

function toPublic(row: SolutionAdminRow): Solution {
  return {
    slug: row.slug,
    ar: { title: row.titleAr, description: row.descriptionAr, sections: parseSections(row.bodyAr), checklist: parseChecklist(row.checklistAr) },
    // A guide without an English version simply has no /en page.
    en: row.titleEn.trim() && row.bodyEn.trim() ? { title: row.titleEn, description: row.descriptionEn, sections: parseSections(row.bodyEn), checklist: parseChecklist(row.checklistEn) } : null
  };
}

const CACHE_MS = 30_000;
let cache: { at: number; guides: Solution[] | null } | null = null;
export function clearSolutionCache() { cache = null; }

/** Published guides in order. Never throws: any database problem falls back to the built-in guides. */
export async function getPublicSolutions(): Promise<Solution[]> {
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      await ensureSchema();
      const rows = await prisma.solutionPage.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
      cache = { at: Date.now(), guides: rows.length ? rows.filter((row) => row.published === 1).map((row) => toPublic(toAdminRow(row))).filter((guide) => guide.ar.title.trim() && guide.ar.sections.length) : null };
    }
    return cache.guides ?? builtInSolutions;
  } catch (error) {
    console.error("Solution guides read failed, using built-in guides", error);
    return builtInSolutions;
  }
}

export async function getPublicSolution(slug: string): Promise<Solution | null> {
  return (await getPublicSolutions()).find((guide) => guide.slug === slug) ?? null;
}

export async function listAdminSolutions(): Promise<SolutionAdminRow[]> {
  await ensureSchema();
  return (await prisma.solutionPage.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).map(toAdminRow);
}

export async function seedDefaultSolutionsIfEmpty(): Promise<void> {
  await ensureSchema();
  if ((await prisma.solutionPage.count()) > 0) return;
  const now = new Date().toISOString();
  await prisma.solutionPage.createMany({
    data: builtInSolutions.map((guide, index) => ({
      id: `solution-${randomUUID()}`,
      slug: guide.slug,
      sortOrder: index,
      published: 1,
      titleAr: guide.ar.title,
      descriptionAr: guide.ar.description,
      bodyAr: sectionsToText(guide.ar.sections),
      checklistAr: checklistToText(guide.ar.checklist),
      titleEn: guide.en?.title ?? "",
      descriptionEn: guide.en?.description ?? "",
      bodyEn: guide.en ? sectionsToText(guide.en.sections) : "",
      checklistEn: guide.en ? checklistToText(guide.en.checklist) : "",
      createdAt: now,
      updatedAt: now
    }))
  });
  clearSolutionCache();
}

export type SolutionInput = { slug?: unknown; published?: unknown; titleAr?: unknown; descriptionAr?: unknown; bodyAr?: unknown; checklistAr?: unknown; titleEn?: unknown; descriptionEn?: unknown; bodyEn?: unknown; checklistEn?: unknown };
export type CleanSolution = Omit<SolutionAdminRow, "id" | "sortOrder">;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanSolutionInput(input: SolutionInput): { ok: true; data: CleanSolution } | { ok: false; error: string } {
  const data: CleanSolution = {
    slug: normalizeSlug(typeof input.slug === "string" ? input.slug : ""),
    published: input.published === undefined ? true : Boolean(input.published),
    titleAr: text(input.titleAr, SOLUTION_LIMITS.title),
    descriptionAr: text(input.descriptionAr, SOLUTION_LIMITS.description),
    bodyAr: text(input.bodyAr, SOLUTION_LIMITS.body),
    checklistAr: text(input.checklistAr, SOLUTION_LIMITS.checklist),
    titleEn: text(input.titleEn, SOLUTION_LIMITS.title),
    descriptionEn: text(input.descriptionEn, SOLUTION_LIMITS.description),
    bodyEn: text(input.bodyEn, SOLUTION_LIMITS.body),
    checklistEn: text(input.checklistEn, SOLUTION_LIMITS.checklist)
  };
  if (!data.slug) return { ok: false, error: "الرابط المختصر (slug) مطلوب: حروف إنجليزية وأرقام وشرطات فقط" };
  if (!data.titleAr || !data.descriptionAr) return { ok: false, error: "العنوان والوصف بالعربية مطلوبان" };
  if (!parseSections(data.bodyAr).length) return { ok: false, error: "اكتب محتوى الصفحة بالعربية (قسم واحد على الأقل)" };
  const anyEn = data.titleEn || data.bodyEn;
  if (anyEn && (!data.titleEn || !data.descriptionEn || !data.bodyEn)) return { ok: false, error: "أكمل عنوان ووصف ومحتوى النسخة الإنجليزية معًا أو اتركها كلها فارغة" };
  return { ok: true, data };
}

export type SaveResult = { ok: true; solution: SolutionAdminRow } | { ok: false; error: string; status: number };

export async function createSolution(data: CleanSolution): Promise<SaveResult> {
  await ensureSchema();
  if ((await prisma.solutionPage.count()) >= SOLUTION_LIMITS.guides) return { ok: false, error: "وصلت للحد الأقصى من الصفحات", status: 400 };
  if (await prisma.solutionPage.findUnique({ where: { slug: data.slug } })) return { ok: false, error: "هذا الرابط المختصر مستخدم في صفحة أخرى", status: 409 };
  const last = await prisma.solutionPage.aggregate({ _max: { sortOrder: true } });
  const now = new Date().toISOString();
  const row = await prisma.solutionPage.create({ data: { id: `solution-${randomUUID()}`, ...data, published: data.published ? 1 : 0, sortOrder: (last._max.sortOrder ?? -1) + 1, createdAt: now, updatedAt: now } });
  clearSolutionCache();
  return { ok: true, solution: toAdminRow(row) };
}

export async function updateSolution(id: string, data: CleanSolution): Promise<SaveResult> {
  await ensureSchema();
  const clash = await prisma.solutionPage.findUnique({ where: { slug: data.slug } });
  if (clash && clash.id !== id) return { ok: false, error: "هذا الرابط المختصر مستخدم في صفحة أخرى", status: 409 };
  const updated = await prisma.solutionPage.updateMany({ where: { id }, data: { ...data, published: data.published ? 1 : 0, updatedAt: new Date().toISOString() } });
  clearSolutionCache();
  if (updated.count === 0) return { ok: false, error: "الصفحة غير موجودة", status: 404 };
  const row = await prisma.solutionPage.findUnique({ where: { id } });
  return row ? { ok: true, solution: toAdminRow(row) } : { ok: false, error: "الصفحة غير موجودة", status: 404 };
}

export async function deleteSolution(id: string): Promise<boolean> {
  await ensureSchema();
  const result = await prisma.solutionPage.deleteMany({ where: { id } });
  clearSolutionCache();
  return result.count > 0;
}
