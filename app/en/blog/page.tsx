import type { Metadata } from "next";
import { applyPageSeo } from "../../../lib/page-seo";
import { BlogIndexView } from "../../ContentViews";
import { getPublicPosts } from "../../../lib/blog-store";

// Managed from the admin panel, so it reads the database on each request (and never at build time).
export const dynamic = "force-dynamic";

const baseMetadata: Metadata = {
  title: { absolute: "Blog | Linkly" },
  description: "Practical guides for customer service and sales teams from Linkly.",
  alternates: { canonical: "/en/blog", languages: { "ar-SA": "/blog", en: "/en/blog" } }
};

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/blog", baseMetadata);
}

export default async function BlogPageEn() {
  return <BlogIndexView lang="en" posts={await getPublicPosts()} />;
}
