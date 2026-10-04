import type { Metadata } from "next";
import { FaqView } from "../ContentViews";
import { getFaqs } from "../../lib/faq-store";

// Managed from the admin panel, so it reads the database on each request (and never at build time).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الأسئلة الشائعة",
  description: "إجابات عن أكثر الأسئلة شيوعًا حول Linkly: واتساب، الباقات، الرسوم، الأمان وواجهة البرمجة.",
  alternates: { canonical: "/faq", languages: { "ar-SA": "/faq", en: "/en/faq" } }
};

export default async function FaqPage() {
  return <FaqView lang="ar" faqs={await getFaqs("ar")} />;
}
