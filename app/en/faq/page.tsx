import type { Metadata } from "next";
import { FaqView } from "../../ContentViews";
import { getFaqs } from "../../../lib/faq-store";

// Managed from the admin panel, so it reads the database on each request (and never at build time).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "FAQ | Linkly" },
  description: "Answers to the most common questions about Linkly: WhatsApp, plans, fees, security and the API.",
  alternates: { canonical: "/en/faq", languages: { "ar-SA": "/faq", en: "/en/faq" } }
};

export default async function FaqPageEn() {
  return <FaqView lang="en" faqs={await getFaqs("en")} />;
}
