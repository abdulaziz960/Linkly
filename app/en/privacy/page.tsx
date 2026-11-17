import type { Metadata } from "next";
import LegalPageView from "../../LegalPageView";
import { applyPageSeo } from "../../../lib/page-seo";

const baseMetadata: Metadata = {
  title: { absolute: "Privacy Policy | Linkly" },
  description: "How Linkly collects, uses, and protects customer and account data across connected channels like WhatsApp, Instagram, and email.",
  alternates: { canonical: "/en/privacy", languages: { "ar-SA": "/privacy", en: "/en/privacy", "x-default": "/privacy" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/privacy", baseMetadata);
}

export default function PrivacyPageEn() {
  return <LegalPageView slug="privacy" lang="en" />;
}
