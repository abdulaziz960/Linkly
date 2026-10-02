import type { Metadata } from "next";
import { BlogIndexView } from "../../ContentViews";

export const metadata: Metadata = {
  title: { absolute: "Blog | Linkly" },
  description: "Practical guides for customer service and sales teams from Linkly.",
  alternates: { canonical: "/en/blog", languages: { "ar-SA": "/blog", en: "/en/blog" } }
};

export default function BlogPageEn() {
  return <BlogIndexView lang="en" />;
}
