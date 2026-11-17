import type { Metadata } from "next";
import LegalPageView from "../../LegalPageView";
import { applyPageSeo } from "../../../lib/page-seo";

const baseMetadata: Metadata = {
  title: { absolute: "Contact us | Linkly" },
  description: "Contact the Linkly team for sales, support, and help setting up your customer service channels.",
  alternates: { canonical: "/en/contact", languages: { "ar-SA": "/contact", en: "/en/contact", "x-default": "/contact" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/contact", baseMetadata);
}

export default function ContactPageEn() {
  return <LegalPageView slug="contact" lang="en" />;
}
