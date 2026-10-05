import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";

/**
 * Redirect rules managed from the admin panel (301/302 to another page, or 410 Gone),
 * applied by proxy.ts before the page renders - no code change per redirect.
 */

export const REDIRECT_STATUSES = [301, 302, 410] as const;
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number];
export type RedirectRow = { id: string; fromPath: string; toUrl: string; statusCode: RedirectStatus; enabled: boolean; note: string };

export const REDIRECT_LIMITS = { rules: 2000, url: 500, note: 200 };

// Paths the app itself owns - a rule here could lock the admin out or break the product.
const RESERVED_PREFIXES = ["/api", "/_next", "/dashboard", "/linkly-admin007", "/media", "/login", "/signup", "/billing", "/checkout"];

/** "/Old/Page/?x=1#y" -> "/Old/Page" (no query, hash or trailing slash; "/" stays "/"). */
export function normalizePath(value: string): string {
  let path = value.trim().split("#")[0].split("?")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path;
}

function isReserved(path: string) {
  return RESERVED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export type CleanRedirect = { fromPath: string; toUrl: string; statusCode: RedirectStatus; enabled: boolean; note: string };

export function cleanRedirectInput(input: { fromPath?: unknown; toUrl?: unknown; statusCode?: unknown; enabled?: unknown; note?: unknown }): { ok: true; data: CleanRedirect } | { ok: false; error: string } {
  const fromRaw = typeof input.fromPath === "string" ? input.fromPath.trim() : "";
  if (!fromRaw || fromRaw.length > REDIRECT_LIMITS.url) return { ok: false, error: "المسار القديم مطلوب، مثل /old-page" };
  if (/^https?:\/\//i.test(fromRaw)) return { ok: false, error: "اكتب المسار فقط بدون النطاق، مثل /old-page" };
  const fromPath = normalizePath(fromRaw);
  if (isReserved(fromPath)) return { ok: false, error: "لا يمكن إنشاء تحويل على هذا المسار (مسار محجوز للنظام)" };

  const statusCode = Number(input.statusCode ?? 301) as RedirectStatus;
  if (!REDIRECT_STATUSES.includes(statusCode)) return { ok: false, error: "نوع التحويل غير صالح (301 أو 302 أو 410)" };

  let toUrl = typeof input.toUrl === "string" ? input.toUrl.trim().slice(0, REDIRECT_LIMITS.url) : "";
  if (statusCode === 410) {
    toUrl = "";
  } else {
    if (!toUrl) return { ok: false, error: "الوجهة الجديدة مطلوبة" };
    if (toUrl.startsWith("/") && !toUrl.startsWith("//")) {
      if (normalizePath(toUrl) === fromPath) return { ok: false, error: "الوجهة لا يجوز أن تساوي المسار القديم (حلقة تحويل)" };
    } else {
      try {
        const url = new URL(toUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
      } catch {
        return { ok: false, error: "الوجهة يجب أن تكون مسارًا مثل /new-page أو رابطًا كاملًا يبدأ بـ https://" };
      }
    }
  }
  return { ok: true, data: { fromPath, toUrl, statusCode, enabled: input.enabled === undefined ? true : Boolean(input.enabled), note: typeof input.note === "string" ? input.note.trim().slice(0, REDIRECT_LIMITS.note) : "" } };
}

function toRow(row: { id: string; fromPath: string; toUrl: string; statusCode: number; enabled: number; note: string }): RedirectRow {
  return { id: row.id, fromPath: row.fromPath, toUrl: row.toUrl, statusCode: row.statusCode as RedirectStatus, enabled: row.enabled === 1, note: row.note };
}

export async function listRedirects(): Promise<RedirectRow[]> {
  await ensureSchema();
  return (await prisma.redirect.findMany({ orderBy: { createdAt: "desc" } })).map(toRow);
}

const CACHE_MS = 30_000;
let cache: { at: number; map: Map<string, { to: string; status: RedirectStatus }> } | null = null;
export function clearRedirectCache() { cache = null; }

/** Enabled rules by path. Never throws: a database problem just means "no managed redirects" for now. */
export async function getRedirectMap() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const map = new Map<string, { to: string; status: RedirectStatus }>();
  try {
    await ensureSchema();
    for (const row of await prisma.redirect.findMany({ where: { enabled: 1 } })) map.set(row.fromPath, { to: row.toUrl, status: row.statusCode as RedirectStatus });
  } catch (error) {
    console.error("Redirect rules read failed", error);
    // Keep serving the last good map if there is one.
    if (cache) return cache.map;
  }
  cache = { at: Date.now(), map };
  return map;
}

export async function findRedirect(pathname: string) {
  return (await getRedirectMap()).get(normalizePath(pathname)) ?? null;
}

/** Follows the enabled rules from `start` and reports whether they ever come back to a path already visited. */
function leadsToLoop(start: string, target: string, rules: Map<string, string>) {
  const seen = new Set<string>([start]);
  let current = normalizePath(target);
  for (let hops = 0; hops < 20; hops += 1) {
    if (seen.has(current)) return true;
    seen.add(current);
    const next = rules.get(current);
    if (!next) return false;
    current = normalizePath(next);
  }
  return true;
}

export type RedirectSave = { ok: true; rule: RedirectRow } | { ok: false; error: string; status: number };

async function loopCheck(data: CleanRedirect, ignoreId?: string): Promise<boolean> {
  if (!data.enabled || data.statusCode === 410 || !data.toUrl.startsWith("/")) return false;
  const rules = new Map<string, string>();
  for (const row of await prisma.redirect.findMany({ where: { enabled: 1, statusCode: { not: 410 } } })) {
    if (row.id !== ignoreId && row.toUrl.startsWith("/")) rules.set(row.fromPath, row.toUrl);
  }
  return leadsToLoop(data.fromPath, data.toUrl, rules);
}

export async function createRedirect(data: CleanRedirect): Promise<RedirectSave> {
  await ensureSchema();
  if ((await prisma.redirect.count()) >= REDIRECT_LIMITS.rules) return { ok: false, error: "وصلت للحد الأقصى من قواعد التحويل", status: 400 };
  if (await prisma.redirect.findUnique({ where: { fromPath: data.fromPath } })) return { ok: false, error: "يوجد تحويل لهذا المسار مسبقًا", status: 409 };
  if (await loopCheck(data)) return { ok: false, error: "هذا التحويل يسبب حلقة تحويلات (A ← B ← A)", status: 400 };
  const now = new Date().toISOString();
  const row = await prisma.redirect.create({ data: { id: `redir-${randomUUID()}`, fromPath: data.fromPath, toUrl: data.toUrl, statusCode: data.statusCode, enabled: data.enabled ? 1 : 0, note: data.note, createdAt: now, updatedAt: now } });
  clearRedirectCache();
  return { ok: true, rule: toRow(row) };
}

export async function updateRedirect(id: string, data: CleanRedirect): Promise<RedirectSave> {
  await ensureSchema();
  const clash = await prisma.redirect.findUnique({ where: { fromPath: data.fromPath } });
  if (clash && clash.id !== id) return { ok: false, error: "يوجد تحويل لهذا المسار مسبقًا", status: 409 };
  if (await loopCheck(data, id)) return { ok: false, error: "هذا التحويل يسبب حلقة تحويلات (A ← B ← A)", status: 400 };
  const updated = await prisma.redirect.updateMany({ where: { id }, data: { fromPath: data.fromPath, toUrl: data.toUrl, statusCode: data.statusCode, enabled: data.enabled ? 1 : 0, note: data.note, updatedAt: new Date().toISOString() } });
  clearRedirectCache();
  if (updated.count === 0) return { ok: false, error: "القاعدة غير موجودة", status: 404 };
  const row = await prisma.redirect.findUnique({ where: { id } });
  return row ? { ok: true, rule: toRow(row) } : { ok: false, error: "القاعدة غير موجودة", status: 404 };
}

export async function deleteRedirect(id: string): Promise<boolean> {
  await ensureSchema();
  const result = await prisma.redirect.deleteMany({ where: { id } });
  clearRedirectCache();
  return result.count > 0;
}
