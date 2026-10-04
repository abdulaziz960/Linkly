import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { faqsAr, faqsEn } from "./faq";

/**
 * FAQ content, managed from the admin panel. While nobody has added or edited
 * an entry, the built-in defaults in lib/faq.ts are shown; the first time the
 * admin page is opened those defaults are copied into the table so they can be
 * edited like any other entry.
 */

export type FaqItemRow = { id: string; questionAr: string; answerAr: string; questionEn: string; answerEn: string; sortOrder: number; active: boolean };
export type FaqPair = readonly [string, string];

export const FAQ_LIMITS = { question: 300, answer: 2000, items: 100 };

function toRow(row: { id: string; questionAr: string; answerAr: string; questionEn: string; answerEn: string; sortOrder: number; active: number }): FaqItemRow {
  return { id: row.id, questionAr: row.questionAr, answerAr: row.answerAr, questionEn: row.questionEn, answerEn: row.answerEn, sortOrder: row.sortOrder, active: row.active === 1 };
}

const CACHE_MS = 30_000;
let cache: { at: number; items: FaqItemRow[] | null } | null = null;
export function clearFaqCache() { cache = null; }

/** The entries visitors see, in the requested language. Never throws: any database problem falls back to the defaults. */
export async function getFaqs(lang: "ar" | "en"): Promise<FaqPair[]> {
  const defaults = (lang === "en" ? faqsEn : faqsAr) as unknown as FaqPair[];
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      await ensureSchema();
      const rows = await prisma.faqItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
      cache = { at: Date.now(), items: rows.length ? rows.map(toRow) : null };
    }
    if (!cache.items) return defaults; // never configured -> the built-in defaults
    return cache.items
      .filter((item) => item.active)
      .map((item): FaqPair => (lang === "en" ? [item.questionEn || item.questionAr, item.answerEn || item.answerAr] : [item.questionAr || item.questionEn, item.answerAr || item.answerEn]))
      .filter(([q, a]) => q.trim() && a.trim());
  } catch (error) {
    console.error("FAQ read failed, using defaults", error);
    return defaults;
  }
}

export async function listFaqItems(): Promise<FaqItemRow[]> {
  await ensureSchema();
  return (await prisma.faqItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).map(toRow);
}

/** Copies the built-in questions into the table the first time (so the admin can edit them). */
export async function seedDefaultFaqsIfEmpty(): Promise<void> {
  await ensureSchema();
  if ((await prisma.faqItem.count()) > 0) return;
  const now = new Date().toISOString();
  await prisma.faqItem.createMany({
    data: faqsAr.map(([questionAr, answerAr], index) => ({
      id: `faq-${randomUUID()}`,
      questionAr,
      answerAr,
      questionEn: faqsEn[index]?.[0] ?? "",
      answerEn: faqsEn[index]?.[1] ?? "",
      sortOrder: index,
      active: 1,
      createdAt: now,
      updatedAt: now
    }))
  });
  clearFaqCache();
}

export type FaqInput = { questionAr?: unknown; answerAr?: unknown; questionEn?: unknown; answerEn?: unknown; active?: unknown };

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanFaqInput(input: FaqInput): { ok: true; data: { questionAr: string; answerAr: string; questionEn: string; answerEn: string; active: boolean } } | { ok: false; error: string } {
  const data = {
    questionAr: text(input.questionAr, FAQ_LIMITS.question),
    answerAr: text(input.answerAr, FAQ_LIMITS.answer),
    questionEn: text(input.questionEn, FAQ_LIMITS.question),
    answerEn: text(input.answerEn, FAQ_LIMITS.answer),
    active: input.active === undefined ? true : Boolean(input.active)
  };
  if (!data.questionAr || !data.answerAr) return { ok: false, error: "السؤال والجواب بالعربية مطلوبان" };
  // An English version is optional: the Arabic text is shown on /en when it is left blank.
  if ((data.questionEn && !data.answerEn) || (!data.questionEn && data.answerEn)) return { ok: false, error: "أكمل السؤال والجواب بالإنجليزية معًا أو اتركهما فارغين" };
  return { ok: true, data };
}

export async function createFaqItem(data: { questionAr: string; answerAr: string; questionEn: string; answerEn: string; active: boolean }): Promise<FaqItemRow | null> {
  await ensureSchema();
  if ((await prisma.faqItem.count()) >= FAQ_LIMITS.items) return null;
  const last = await prisma.faqItem.aggregate({ _max: { sortOrder: true } });
  const now = new Date().toISOString();
  const row = await prisma.faqItem.create({ data: { id: `faq-${randomUUID()}`, ...data, active: data.active ? 1 : 0, sortOrder: (last._max.sortOrder ?? -1) + 1, createdAt: now, updatedAt: now } });
  clearFaqCache();
  return toRow(row);
}

export async function updateFaqItem(id: string, data: { questionAr: string; answerAr: string; questionEn: string; answerEn: string; active: boolean }): Promise<FaqItemRow | null> {
  await ensureSchema();
  const updated = await prisma.faqItem.updateMany({ where: { id }, data: { ...data, active: data.active ? 1 : 0, updatedAt: new Date().toISOString() } });
  clearFaqCache();
  if (updated.count === 0) return null;
  const row = await prisma.faqItem.findUnique({ where: { id } });
  return row ? toRow(row) : null;
}

export async function deleteFaqItem(id: string): Promise<boolean> {
  await ensureSchema();
  const result = await prisma.faqItem.deleteMany({ where: { id } });
  clearFaqCache();
  return result.count > 0;
}

/** Saves a new order: `ids` listed first-to-last get sortOrder 0..n; ids not listed keep going after them. */
export async function reorderFaqItems(ids: string[]): Promise<void> {
  await ensureSchema();
  const unique = Array.from(new Set(ids));
  await prisma.$transaction(unique.map((id, index) => prisma.faqItem.updateMany({ where: { id }, data: { sortOrder: index, updatedAt: new Date().toISOString() } })));
  clearFaqCache();
}
