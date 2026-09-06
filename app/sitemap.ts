import type { MetadataRoute } from "next";

const baseUrl = "https://linklysa.io";

// Each Arabic path paired with its English counterpart, so every sitemap
// entry can carry reciprocal hreflang alternates (Google treats sitemap
// alternates the same as <link rel="alternate hreflang"> tags).
const pages: Array<{ ar: string; en: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { ar: "/", en: "/en", changeFrequency: "weekly", priority: 1 },
  { ar: "/contact", en: "/en/contact", changeFrequency: "yearly", priority: 0.4 },
  { ar: "/terms", en: "/en/terms", changeFrequency: "yearly", priority: 0.3 },
  { ar: "/privacy", en: "/en/privacy", changeFrequency: "yearly", priority: 0.3 },
  { ar: "/data-deletion", en: "/en/data-deletion", changeFrequency: "yearly", priority: 0.3 }
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap(({ ar, en, changeFrequency, priority }) => {
    const languages = { "ar-SA": `${baseUrl}${ar}`, en: `${baseUrl}${en}`, "x-default": `${baseUrl}${ar}` };
    return [
      { url: `${baseUrl}${ar}`, changeFrequency, priority, alternates: { languages } },
      { url: `${baseUrl}${en}`, changeFrequency, priority: Math.max(0.3, priority - 0.3), alternates: { languages } }
    ];
  });
}
