import type { MetadataRoute } from "next";
import { blogPosts } from "../lib/blog";

const baseUrl = "https://linklysa.io";

// Each Arabic path paired with its English counterpart, so every sitemap
// entry can carry reciprocal hreflang alternates (Google treats sitemap
// alternates the same as <link rel="alternate hreflang"> tags).
type PageEntry = { ar: string; en: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number; lastModified?: Date };
const pages: Array<{ ar: string; en: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { ar: "/", en: "/en", changeFrequency: "weekly", priority: 1 },
  { ar: "/faq", en: "/en/faq", changeFrequency: "monthly", priority: 0.6 },
  { ar: "/blog", en: "/en/blog", changeFrequency: "weekly", priority: 0.6 },
  { ar: "/contact", en: "/en/contact", changeFrequency: "yearly", priority: 0.4 },
  { ar: "/terms", en: "/en/terms", changeFrequency: "yearly", priority: 0.3 },
  { ar: "/privacy", en: "/en/privacy", changeFrequency: "yearly", priority: 0.3 },
  { ar: "/data-deletion", en: "/en/data-deletion", changeFrequency: "yearly", priority: 0.3 }
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Blog posts come from lib/blog.ts, so a new post appears here automatically.
  const postPages: PageEntry[] = blogPosts.map((post) => ({
    ar: `/blog/${post.slug}`,
    en: `/en/blog/${post.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
    lastModified: new Date(post.date)
  }));
  return ([...pages, ...postPages] as PageEntry[]).flatMap((page) => {
    const { ar, en, changeFrequency, priority } = page;
    const languages = { "ar-SA": `${baseUrl}${ar}`, en: `${baseUrl}${en}`, "x-default": `${baseUrl}${ar}` };
    const { lastModified } = page;
    return [
      { url: `${baseUrl}${ar}`, lastModified, changeFrequency, priority, alternates: { languages } },
      { url: `${baseUrl}${en}`, lastModified, changeFrequency, priority: Math.max(0.3, priority - 0.3), alternates: { languages } }
    ];
  });
}
