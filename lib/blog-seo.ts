import type { Metadata } from "next";
import type { PublicPost } from "./blog-store";

type Lang = "ar" | "en";

/** Page path of a post in a language (no origin). */
export function postPath(slug: string, lang: Lang): string {
  return lang === "en" ? `/en/blog/${slug}` : `/blog/${slug}`;
}

/** Title/description with the SEO override first, falling back to the article's own. */
export function postSeoText(post: PublicPost, lang: Lang) {
  const content = post[lang]!;
  const seo = post.seo[lang];
  const metaTitle = seo.metaTitle.trim() || content.title;
  const metaDescription = seo.metaDescription.trim() || content.description;
  return {
    metaTitle,
    metaDescription,
    ogTitle: seo.ogTitle.trim() || metaTitle,
    ogDescription: seo.ogDescription.trim() || metaDescription,
    imageAlt: seo.imageAlt.trim() || content.title
  };
}

/** The image used for sharing: the OG image, else the featured image, else none (the site default applies). */
export function postShareImage(post: PublicPost): string {
  return post.seo.ogImage || post.seo.featuredImage;
}

/** Next.js metadata for a post page: title, description, canonical, robots and Open Graph/Twitter. */
export function postMetadata(post: PublicPost, lang: Lang): Metadata {
  const text = postSeoText(post, lang);
  const path = postPath(post.slug, lang);
  // The canonical override applies to the Arabic page; the English page always points at itself.
  const canonical = lang === "ar" && post.seo.canonicalUrl ? post.seo.canonicalUrl : path;
  // A post without its own image shares with the site's default card instead of a bare link.
  const image = postShareImage(post) || "/opengraph-image";
  return {
    title: text.metaTitle,
    description: text.metaDescription,
    alternates: {
      canonical,
      ...(post.en ? { languages: { "ar-SA": postPath(post.slug, "ar"), en: postPath(post.slug, "en") } } : {})
    },
    robots: post.seo.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "article",
      title: text.ogTitle,
      description: text.ogDescription,
      url: path,
      locale: lang === "en" ? "en_US" : "ar_SA",
      publishedTime: post.date,
      ...(image ? { images: [{ url: image, alt: text.imageAlt }] } : {})
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: text.ogTitle,
      description: text.ogDescription,
      ...(image ? { images: [image] } : {})
    }
  };
}
