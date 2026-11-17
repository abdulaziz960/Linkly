import type { Metadata } from "next";
import LegalPageView from "../LegalPageView";
import { applyPageSeo } from "../../lib/page-seo";

const baseMetadata: Metadata = {
  title: { absolute: "سياسة الخصوصية | Linkly" },
  description: "كيف تجمع Linkly بيانات العملاء والحساب وتستخدمها وتحميها عبر القنوات المرتبطة مثل واتساب وإنستغرام والبريد.",
  alternates: { canonical: "/privacy", languages: { "ar-SA": "/privacy", en: "/en/privacy", "x-default": "/privacy" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/privacy", baseMetadata);
}

export default function PrivacyPage() {
  return <LegalPageView slug="privacy" lang="ar" />;
}
