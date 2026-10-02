import type { Metadata } from "next";
import { BlogIndexView } from "../ContentViews";

export const metadata: Metadata = {
  title: "المدونة",
  description: "أدلة عملية لفرق خدمة العملاء والمبيعات من Linkly.",
  alternates: { canonical: "/blog", languages: { "ar-SA": "/blog", en: "/en/blog" } }
};

export default function BlogPage() {
  return <BlogIndexView lang="ar" />;
}
