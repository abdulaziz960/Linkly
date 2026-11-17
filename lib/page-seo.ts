import type { Metadata } from "next";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { cleanUrl } from "./blog-store";
import { DEFAULT_PAGE_SEO, type PageSeoDefault } from "./page-seo-defaults";
import { solutions as builtInSolutions, solutionPath, solutionSeo, type Solution } from "./solution-content";
import { getPublicSolutions } from "./solution-store";

/**
 * SEO overrides for the fixed public pages (home, FAQ, contact, legal...),
 * edited from the admin panel. A field the admin has not filled in falls back to the
 * complete defaults in lib/page-seo-defaults.ts; a saved value always wins.
 * Blog posts have their own fields (see lib/blog-seo.ts).
 */

export const KNOWN_PAGES: Array<{ path: string; label: string }> = [
  { path: "/", label: "الصفحة الرئيسية (عربي)" },
  { path: "/en", label: "Home (English)" },
  { path: "/solutions", label: "الحلول - فهرس الأدلة (عربي)" },
  { path: "/en/solutions", label: "Solutions - guides index (English)" },
  { path: "/faq", label: "الأسئلة الشائعة (عربي)" },
  { path: "/en/faq", label: "FAQ (English)" },
  { path: "/blog", label: "فهرس المدونة (عربي)" },
  { path: "/en/blog", label: "Blog index (English)" },
  { path: "/contact", label: "تواصل معنا (عربي)" },
  { path: "/en/contact", label: "Contact (English)" },
  { path: "/terms", label: "الشروط (عربي)" },
  { path: "/en/terms", label: "Terms (English)" },
  { path: "/privacy", label: "الخصوصية (عربي)" },
  { path: "/en/privacy", label: "Privacy (English)" },
  { path: "/data-deletion", label: "حذف البيانات (عربي)" },
  { path: "/en/data-deletion", label: "Data deletion (English)" }
];

/**
 * Pages whose built-in SEO is not a fixed text: the pricing page (its description follows the plan prices) and the solution guides
 * (their text is the guide's own title and description). An admin can still override any field; an empty field keeps the built-in value.
 */
const PRICING_PAGES: Array<{ path: string; label: string }> = [
  { path: "/pricing", label: "الأسعار (عربي) - العنوان والوصف تلقائيان حسب الأسعار ما لم تكتب غيرهما" },
  { path: "/en/pricing", label: "Pricing (English) - title and description follow the prices unless you write your own" }
];

function guidePages(guides: Solution[]): Array<{ path: string; label: string }> {
  return guides.flatMap((solution) => [
    { path: solutionPath(solution.slug, "ar"), label: `حلول: ${solution.ar.title} (عربي)` },
    ...(solution.en ? [{ path: solutionPath(solution.slug, "en"), label: `Solutions: ${solution.en.title} (English)` }] : [])
  ]);
}

/** Every page the admin panel can set SEO for right now (the guides come from the admin panel's own list). */
export async function editablePages(): Promise<Array<{ path: string; label: string }>> {
  return [...KNOWN_PAGES, ...PRICING_PAGES, ...guidePages(await getPublicSolutions())];
}

/** The built-in set (fixed pages, pricing and the built-in guides): what an input is checked against when no list is given. */
export const EDITABLE_PAGES = [...KNOWN_PAGES, ...PRICING_PAGES, ...guidePages(builtInSolutions)];

/** What a page shows when nothing is saved for it: the written defaults, or for a solution guide its own title and description. */
function builtInDefault(path: string, guides: Solution[]): PageSeoDefault | undefined {
  if (DEFAULT_PAGE_SEO[path]) return DEFAULT_PAGE_SEO[path];
  for (const solution of guides) {
    for (const lang of ["ar", "en"] as const) {
      const content = solution[lang];
      if (!content || solutionPath(solution.slug, lang) !== path) continue;
      const seo = solutionSeo(content);
      return { metaTitle: seo.title, metaDescription: seo.description, ogTitle: seo.title, ogDescription: seo.description, canonicalUrl: `https://linklysa.io${path}`, ogImage: "https://linklysa.io/opengraph-image?v=3" };
    }
  }
  return undefined;
}

export type PageSeoRow = { path: string; label: string; metaTitle: string; metaDescription: string; canonicalUrl: string; noindex: boolean; ogTitle: string; ogDescription: string; ogImage: string };
export type PageSeoInput = { metaTitle?: unknown; metaDescription?: unknown; canonicalUrl?: unknown; noindex?: unknown; ogTitle?: unknown; ogDescription?: unknown; ogImage?: unknown };

type Stored = Omit<PageSeoRow, "label">;
const blank = (path: string): Stored => ({ path, metaTitle: "", metaDescription: "", canonicalUrl: "", noindex: false, ogTitle: "", ogDescription: "", ogImage: "" });

/** Stored values first, then the built-in defaults, per field. */
function withDefaults(path: string, stored: Stored, guides: Solution[] = []): Stored {
  const fallback = builtInDefault(path, guides);
  if (!fallback) return stored;
  const pick = (value: string, fallbackValue: string) => value.trim() || fallbackValue;
  return {
    ...stored,
    metaTitle: pick(stored.metaTitle, fallback.metaTitle),
    metaDescription: pick(stored.metaDescription, fallback.metaDescription),
    canonicalUrl: pick(stored.canonicalUrl, fallback.canonicalUrl),
    ogTitle: pick(stored.ogTitle, fallback.ogTitle),
    ogDescription: pick(stored.ogDescription, fallback.ogDescription),
    ogImage: pick(stored.ogImage, fallback.ogImage)
  };
}

const CACHE_MS = 30_000;
let cache: { at: number; rows: Map<string, Stored> } | null = null;
export function clearPageSeoCache() { cache = null; }

async function loadRows(): Promise<Map<string, Stored>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = new Map<string, Stored>();
  try {
    await ensureSchema();
    for (const row of await prisma.pageSeo.findMany()) {
      rows.set(row.path, { path: row.path, metaTitle: row.metaTitle, metaDescription: row.metaDescription, canonicalUrl: row.canonicalUrl, noindex: row.noindex === 1, ogTitle: row.ogTitle, ogDescription: row.ogDescription, ogImage: row.ogImage });
    }
  } catch (error) {
    console.error("Page SEO read failed, using built-in metadata", error);
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getPageSeo(path: string): Promise<Stored> {
  // Only a guide page needs the guide list (its own title and description are its default).
  const guides = path.includes("/solutions/") ? await getPublicSolutions() : [];
  return withDefaults(path, (await loadRows()).get(path) ?? blank(path), guides);
}

/** Pages an admin marked noindex - kept out of sitemap.xml. */
export async function getNoindexPaths(): Promise<Set<string>> {
  return new Set([...(await loadRows()).values()].filter((row) => row.noindex).map((row) => row.path));
}

/** The page's built-in metadata with the admin's overrides on top. Never throws. */
export async function applyPageSeo(path: string, base: Metadata): Promise<Metadata> {
  const seo = await getPageSeo(path);
  const title = seo.metaTitle.trim();
  const description = seo.metaDescription.trim() || undefined;
  const ogTitle = seo.ogTitle.trim() || title;
  const ogDescription = seo.ogDescription.trim() || description;
  const ogImage = seo.ogImage.trim();
  const baseOg = (base.openGraph ?? {}) as Record<string, unknown>;
  return {
    ...base,
    ...(title ? { title: { absolute: title } } : {}),
    ...(description ? { description } : {}),
    alternates: { ...(base.alternates ?? {}), ...(seo.canonicalUrl.trim() ? { canonical: seo.canonicalUrl.trim() } : {}) },
    ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      ...baseOg,
      ...(ogTitle ? { title: ogTitle } : {}),
      ...(ogDescription ? { description: ogDescription } : {}),
      ...(ogImage ? { images: [{ url: ogImage }] } : {})
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      ...(base.twitter ?? {}),
      ...(ogTitle ? { title: ogTitle } : {}),
      ...(ogDescription ? { description: ogDescription } : {}),
      ...(ogImage ? { images: [ogImage] } : {})
    } as Metadata["twitter"]
  };
}

export async function listPageSeo(): Promise<PageSeoRow[]> {
  const rows = await loadRowsFresh();
  const guides = await getPublicSolutions();
  return (await editablePages()).map((page) => ({ ...withDefaults(page.path, rows.get(page.path) ?? blank(page.path), guides), label: page.label }));
}

async function loadRowsFresh() {
  clearPageSeoCache();
  return loadRows();
}

export function cleanPageSeoInput(path: string, input: PageSeoInput, pages: Array<{ path: string }> = EDITABLE_PAGES): { ok: true; data: Stored } | { ok: false; error: string } {
  if (!pages.some((page) => page.path === path)) return { ok: false, error: "صفحة غير معروفة" };
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const canonicalUrl = cleanUrl(input.canonicalUrl);
  const ogImage = cleanUrl(input.ogImage);
  if (canonicalUrl === null || (canonicalUrl && !canonicalUrl.startsWith("http"))) return { ok: false, error: "رابط Canonical يجب أن يكون رابطًا كاملًا يبدأ بـ https://" };
  if (ogImage === null) return { ok: false, error: "رابط صورة المشاركة غير صالح" };
  return { ok: true, data: { path, metaTitle: text(input.metaTitle, 120), metaDescription: text(input.metaDescription, 320), canonicalUrl, noindex: Boolean(input.noindex), ogTitle: text(input.ogTitle, 120), ogDescription: text(input.ogDescription, 320), ogImage } };
}

export async function savePageSeo(data: Stored): Promise<PageSeoRow> {
  await ensureSchema();
  const values = { metaTitle: data.metaTitle, metaDescription: data.metaDescription, canonicalUrl: data.canonicalUrl, noindex: data.noindex ? 1 : 0, ogTitle: data.ogTitle, ogDescription: data.ogDescription, ogImage: data.ogImage, updatedAt: new Date().toISOString() };
  await prisma.pageSeo.upsert({ where: { path: data.path }, create: { path: data.path, ...values }, update: values });
  clearPageSeoCache();
  const label = (await editablePages()).find((page) => page.path === data.path)?.label ?? data.path;
  return { ...data, label };
}
