import type { Metadata } from "next";
import { applyPageSeo } from "../../lib/page-seo";
import { FaqView } from "../ContentViews";
import { getFaqs } from "../../lib/faq-store";

// Managed from the admin panel, so it reads the database on each request (and never at build time).
export const dynamic = "force-dynamic";

const baseMetadata: Metadata = {
  title: "الأسئلة الشائعة",
  description: "إجابات عن أكثر الأسئلة شيوعًا حول Linkly: واتساب، الباقات، الرسوم، الأمان وواجهة البرمجة.",
  alternates: { canonical: "/faq", languages: { "ar-SA": "/faq", en: "/en/faq" } }
};

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/faq", baseMetadata);
}

export default async function FaqPage() {
  return <FaqView lang="ar" faqs={await getFaqs("ar")} />;
}
