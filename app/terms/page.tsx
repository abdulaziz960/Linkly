import type { Metadata } from "next";
import LegalPageView from "../LegalPageView";
import { applyPageSeo } from "../../lib/page-seo";

const baseMetadata: Metadata = {
  title: { absolute: "شروط الاستخدام | Linkly" },
  description: "شروط استخدام منصة Linkly لإدارة محادثات العملاء: الاستخدام المقبول، ربط القنوات، الحسابات، والبيانات.",
  alternates: { canonical: "/terms", languages: { "ar-SA": "/terms", en: "/en/terms", "x-default": "/terms" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/terms", baseMetadata);
}

export default function TermsPage() {
  return <LegalPageView slug="terms" lang="ar" />;
}
