import type { Metadata } from "next";
import { applyPageSeo } from "../../lib/page-seo";
import { BlogIndexView } from "../ContentViews";
import { getPublicPosts } from "../../lib/blog-store";

// Managed from the admin panel, so it reads the database on each request (and never at build time).
export const dynamic = "force-dynamic";

const baseMetadata: Metadata = {
  title: "المدونة",
  description: "أدلة عملية لفرق خدمة العملاء والمبيعات من Linkly.",
  alternates: { canonical: "/blog", languages: { "ar-SA": "/blog", en: "/en/blog" } }
};

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/blog", baseMetadata);
}

export default async function BlogPage() {
  return <BlogIndexView lang="ar" posts={await getPublicPosts()} />;
}
