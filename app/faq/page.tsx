import type { Metadata } from "next";
import { FaqView } from "../ContentViews";

export const metadata: Metadata = {
  title: "الأسئلة الشائعة",
  description: "إجابات عن أكثر الأسئلة شيوعًا حول Linkly: واتساب، الباقات، الرسوم، الأمان وواجهة البرمجة.",
  alternates: { canonical: "/faq", languages: { "ar-SA": "/faq", en: "/en/faq" } }
};

export default function FaqPage() {
  return <FaqView lang="ar" />;
}
