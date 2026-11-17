import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { builtInLegalPages, LEGAL_LABELS, LEGAL_SLUGS, type LegalLocale, type LegalSlug } from "./legal-content";

/**
 * The legal pages (privacy policy, terms, data deletion), editable from the admin panel. A page shows the text saved for it; a field the
 * admin left empty (or a page never saved) shows the built-in text in lib/legal-content.ts, so a page can never come out blank.
 */

export const LEGAL_LIMITS = { title: 200, updated: 100, body: 60000 };

export type LegalPageContent = { ar: LegalLocale; en: LegalLocale };

const isSlug = (value: unknown): value is LegalSlug => typeof value === "string" && (LEGAL_SLUGS as readonly string[]).includes(value);

type Row = { id: string; titleAr: string; updatedAr: string; bodyAr: string; titleEn: string; updatedEn: string; bodyEn: string; updatedAt: string };

const pick = (saved: string, builtIn: string) => (saved.trim() ? saved : builtIn);

function merged(slug: LegalSlug, row: Row | undefined): LegalPageContent {
  const base = builtInLegalPages[slug];
  return {
    ar: { title: pick(row?.titleAr ?? "", base.ar.title), updated: pick(row?.updatedAr ?? "", base.ar.updated), body: pick(row?.bodyAr ?? "", base.ar.body) },
    en: { title: pick(row?.titleEn ?? "", base.en.title), updated: pick(row?.updatedEn ?? "", base.en.updated), body: pick(row?.bodyEn ?? "", base.en.body) }
  };
}

const CACHE_MS = 30_000;
let cache: { at: number; rows: Map<string, Row> } | null = null;
export function clearLegalCache() { cache = null; }

async function loadRows(): Promise<Map<string, Row>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = new Map<string, Row>();
  try {
    await ensureSchema();
    for (const row of await prisma.legalPage.findMany()) rows.set(row.id, row);
  } catch (error) {
    console.error("Legal pages read failed, using the built-in text", error);
  }
  cache = { at: Date.now(), rows };
  return rows;
}

/** A legal page's text in both languages. Never throws: any database problem shows the built-in text. */
export async function getLegalPage(slug: LegalSlug): Promise<LegalPageContent> {
  return merged(slug, (await loadRows()).get(slug));
}

export type LegalAdminRow = { slug: LegalSlug; label: string; customized: boolean; updatedAt: string } & { titleAr: string; updatedAr: string; bodyAr: string; titleEn: string; updatedEn: string; bodyEn: string };

export async function listAdminLegalPages(): Promise<LegalAdminRow[]> {
  cache = null;
  const rows = await loadRows();
  return LEGAL_SLUGS.map((slug) => {
    const row = rows.get(slug);
    const page = merged(slug, row);
    return { slug, label: LEGAL_LABELS[slug].ar, customized: Boolean(row), updatedAt: row?.updatedAt ?? "", titleAr: page.ar.title, updatedAr: page.ar.updated, bodyAr: page.ar.body, titleEn: page.en.title, updatedEn: page.en.updated, bodyEn: page.en.body };
  });
}

export type LegalInput = { titleAr?: unknown; updatedAr?: unknown; bodyAr?: unknown; titleEn?: unknown; updatedEn?: unknown; bodyEn?: unknown };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "");

export function cleanLegalInput(slug: unknown, input: LegalInput): { ok: true; slug: LegalSlug; data: Omit<Row, "id" | "updatedAt"> } | { ok: false; error: string } {
  if (!isSlug(slug)) return { ok: false, error: "صفحة غير معروفة" };
  const data = {
    titleAr: text(input.titleAr, LEGAL_LIMITS.title), updatedAr: text(input.updatedAr, LEGAL_LIMITS.updated), bodyAr: text(input.bodyAr, LEGAL_LIMITS.body),
    titleEn: text(input.titleEn, LEGAL_LIMITS.title), updatedEn: text(input.updatedEn, LEGAL_LIMITS.updated), bodyEn: text(input.bodyEn, LEGAL_LIMITS.body)
  };
  if (!data.titleAr || !data.bodyAr) return { ok: false, error: "العنوان والنص بالعربية مطلوبان" };
  if (!data.titleEn || !data.bodyEn) return { ok: false, error: "العنوان والنص بالإنجليزية مطلوبان" };
  return { ok: true, slug, data };
}

export async function saveLegalPage(slug: LegalSlug, data: Omit<Row, "id" | "updatedAt">): Promise<void> {
  await ensureSchema();
  const values = { ...data, updatedAt: new Date().toISOString() };
  await prisma.legalPage.upsert({ where: { id: slug }, create: { id: slug, ...values }, update: values });
  clearLegalCache();
}

/** Puts a page back to the built-in text. */
export async function resetLegalPage(slug: LegalSlug): Promise<void> {
  await ensureSchema();
  await prisma.legalPage.deleteMany({ where: { id: slug } });
  clearLegalCache();
}
