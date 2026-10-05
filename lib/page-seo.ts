import type { Metadata } from "next";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { cleanUrl } from "./blog-store";

/**
 * SEO overrides for the fixed public pages (home, FAQ, contact, legal...),
 * edited from the admin panel. A blank field keeps the page's built-in value.
 * Blog posts have their own fields (see lib/blog-seo.ts).
 */

export const KNOWN_PAGES: Array<{ path: string; label: string }> = [
  { path: "/", label: "الصفحة الرئيسية (عربي)" },
  { path: "/en", label: "Home (English)" },
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

export type PageSeoRow = { path: string; label: string; metaTitle: string; metaDescription: string; canonicalUrl: string; noindex: boolean; ogTitle: string; ogDescription: string; ogImage: string };
export type PageSeoInput = { metaTitle?: unknown; metaDescription?: unknown; canonicalUrl?: unknown; noindex?: unknown; ogTitle?: unknown; ogDescription?: unknown; ogImage?: unknown };

type Stored = Omit<PageSeoRow, "label">;
const blank = (path: string): Stored => ({ path, metaTitle: "", metaDescription: "", canonicalUrl: "", noindex: false, ogTitle: "", ogDescription: "", ogImage: "" });

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
  return (await loadRows()).get(path) ?? blank(path);
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
    } as Metadata["openGraph"]
  };
}

export async function listPageSeo(): Promise<PageSeoRow[]> {
  const rows = await loadRowsFresh();
  return KNOWN_PAGES.map((page) => ({ ...(rows.get(page.path) ?? blank(page.path)), label: page.label }));
}

async function loadRowsFresh() {
  clearPageSeoCache();
  return loadRows();
}

export function cleanPageSeoInput(path: string, input: PageSeoInput): { ok: true; data: Stored } | { ok: false; error: string } {
  if (!KNOWN_PAGES.some((page) => page.path === path)) return { ok: false, error: "صفحة غير معروفة" };
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
  const label = KNOWN_PAGES.find((page) => page.path === data.path)!.label;
  return { ...data, label };
}
