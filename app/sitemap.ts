import type { MetadataRoute } from "next";
import { getPublicPosts, listCategories } from "../lib/blog-store";
import { getNoindexPaths } from "../lib/page-seo";
import { solutions, solutionPath } from "../lib/solution-content";

const baseUrl = "https://linklysa.io";

// Blog posts come from the database, so this is built per request (never at build time).
export const dynamic = "force-dynamic";

// Each Arabic path paired with its English counterpart, so every sitemap
// entry can carry reciprocal hreflang alternates (Google treats sitemap
// alternates the same as <link rel="alternate hreflang"> tags).
type PageEntry = { ar: string; en?: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number; lastModified?: Date };
// The date the marketing pages' text last changed (the sitemap's lastmod); bump it when the landing, pricing or guides change.
const MARKETING_UPDATED = new Date("2026-10-26");
const pages: Array<{ ar: string; en: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number; lastModified?: Date }> = [
  { ar: "/", en: "/en", changeFrequency: "weekly", priority: 1, lastModified: MARKETING_UPDATED },
  { ar: "/pricing", en: "/en/pricing", changeFrequency: "weekly", priority: 0.9, lastModified: MARKETING_UPDATED },
  { ar: "/faq", en: "/en/faq", changeFrequency: "monthly", priority: 0.6 },
  { ar: "/blog", en: "/en/blog", changeFrequency: "weekly", priority: 0.6 },
  { ar: "/contact", en: "/en/contact", changeFrequency: "yearly", priority: 0.4 },
  { ar: "/terms", en: "/en/terms", changeFrequency: "yearly", priority: 0.3 },
  { ar: "/privacy", en: "/en/privacy", changeFrequency: "yearly", priority: 0.3 },
  { ar: "/data-deletion", en: "/en/data-deletion", changeFrequency: "yearly", priority: 0.3 }
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Published blog posts (managed from the admin panel) appear here automatically; /en only for posts that have an English version.
  const [allPosts, noindexPaths] = await Promise.all([getPublicPosts(), getNoindexPaths()]);
  const postPages: PageEntry[] = allPosts.filter((post) => !post.seo.noindex).map((post) => ({
    ar: `/blog/${post.slug}`,
    en: post.en ? `/en/blog/${post.slug}` : undefined,
    changeFrequency: "monthly",
    priority: 0.7,
    lastModified: new Date(post.date)
  }));
  const categoryPages: PageEntry[] = listCategories(allPosts.filter((post) => !post.seo.noindex), "ar").map((category) => ({
    ar: `/blog/category/${category.slug}`,
    en: listCategories(allPosts.filter((post) => !post.seo.noindex), "en").some((item) => item.slug === category.slug) ? `/en/blog/category/${category.slug}` : undefined,
    changeFrequency: "weekly",
    priority: 0.5
  }));
  // Fixed pages an admin marked noindex are left out of the sitemap (both languages' URLs are checked separately).
  const fixedPages = pages.filter((page) => !noindexPaths.has(page.ar)).map((page) => (noindexPaths.has(page.en) ? { ...page, en: undefined } : page));
  const solutionPages: PageEntry[] = solutions.map((item) => ({ ar: solutionPath(item.slug, "ar"), en: solutionPath(item.slug, "en"), changeFrequency: "monthly", priority: 0.8, lastModified: MARKETING_UPDATED }));
  return ([...fixedPages, ...solutionPages, ...postPages, ...categoryPages] as PageEntry[]).flatMap((page) => {
    const { ar, en, changeFrequency, priority } = page;
    const { lastModified } = page;
    if (!en) return [{ url: `${baseUrl}${ar}`, lastModified, changeFrequency, priority }];
    const languages = { "ar-SA": `${baseUrl}${ar}`, en: `${baseUrl}${en}`, "x-default": `${baseUrl}${ar}` };
    return [
      { url: `${baseUrl}${ar}`, lastModified, changeFrequency, priority, alternates: { languages } },
      { url: `${baseUrl}${en}`, lastModified, changeFrequency, priority: Math.max(0.3, priority - 0.3), alternates: { languages } }
    ];
  });
}
