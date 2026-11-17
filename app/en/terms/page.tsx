import type { Metadata } from "next";
import LegalPageView from "../../LegalPageView";
import { applyPageSeo } from "../../../lib/page-seo";

const baseMetadata: Metadata = {
  title: { absolute: "Terms of Service | Linkly" },
  description: "The terms governing use of the Linkly customer communication platform: acceptable use, channel connections, accounts, and data.",
  alternates: { canonical: "/en/terms", languages: { "ar-SA": "/terms", en: "/en/terms", "x-default": "/terms" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/terms", baseMetadata);
}

export default function TermsPageEn() {
  return <LegalPageView slug="terms" lang="en" />;
}
