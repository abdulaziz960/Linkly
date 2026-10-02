import type { Metadata } from "next";
import { FaqView } from "../../ContentViews";

export const metadata: Metadata = {
  title: { absolute: "FAQ | Linkly" },
  description: "Answers to the most common questions about Linkly: WhatsApp, plans, fees, security and the API.",
  alternates: { canonical: "/en/faq", languages: { "ar-SA": "/faq", en: "/en/faq" } }
};

export default function FaqPageEn() {
  return <FaqView lang="en" />;
}
