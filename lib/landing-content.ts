import { createHash } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { LANDING_SLOTS, type LandingSlot } from "./landing-slots";

/**
 * Admin-editable texts of the home pages. An override is stored under the id of
 * the text it replaces ("ar:" or "en:" + a short hash of the built-in text), so
 * the pages need no changes per text: they ask for the text by its default.
 * A blank/removed override falls back to the built-in text.
 */

export type Lang = "ar" | "en";
export const LANDING_TEXT_MAX = 600;

export function slotId(lang: Lang, defaultText: string): string {
  return `${lang}:${createHash("sha1").update(defaultText).digest("hex").slice(0, 10)}`;
}

const CACHE_MS = 30_000;
let cache: { at: number; map: Map<string, string> } | null = null;
export function clearLandingCache() { cache = null; }

/** id -> override. Never throws: a database problem just shows the built-in texts. */
export async function getLandingText(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const map = new Map<string, string>();
  try {
    await ensureSchema();
    for (const row of await prisma.landingContent.findMany()) if (row.value.trim()) map.set(row.id, row.value);
  } catch (error) {
    console.error("Landing text read failed, using built-in texts", error);
    if (cache) return cache.map;
  }
  cache = { at: Date.now(), map };
  return map;
}

export type LandingRow = LandingSlot & { id: string; lang: Lang; override: string };

export async function listLandingRows(): Promise<LandingRow[]> {
  clearLandingCache();
  const overrides = await getLandingText();
  return (["ar", "en"] as const).flatMap((lang) => LANDING_SLOTS[lang].map((slot) => ({ ...slot, id: slotId(lang, slot.text), lang, override: overrides.get(slotId(lang, slot.text)) ?? "" })));
}

export function findSlot(id: string): { lang: Lang; slot: LandingSlot } | null {
  for (const lang of ["ar", "en"] as const) {
    const slot = LANDING_SLOTS[lang].find((item) => slotId(lang, item.text) === id);
    if (slot) return { lang, slot };
  }
  return null;
}

export type SaveLandingResult = { ok: true; id: string; override: string } | { ok: false; error: string };

/** An empty value removes the override (back to the built-in text). Only the registered texts can be edited. */
export async function saveLandingText(id: string, value: unknown): Promise<SaveLandingResult> {
  if (!findSlot(id)) return { ok: false, error: "نص غير معروف" };
  const text = typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, LANDING_TEXT_MAX) : "";
  await ensureSchema();
  if (!text) await prisma.landingContent.deleteMany({ where: { id } });
  else await prisma.landingContent.upsert({ where: { id }, create: { id, value: text, updatedAt: new Date().toISOString() }, update: { value: text, updatedAt: new Date().toISOString() } });
  clearLandingCache();
  return { ok: true, id, override: text };
}
