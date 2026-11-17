import type { Metadata } from "next";
import LegalPageView from "../../LegalPageView";
import { applyPageSeo } from "../../../lib/page-seo";

const baseMetadata: Metadata = {
  title: { absolute: "Data Deletion | Linkly" },
  description: "How to request deletion of your account and customer data from Linkly.",
  alternates: { canonical: "/en/data-deletion", languages: { "ar-SA": "/data-deletion", en: "/en/data-deletion", "x-default": "/data-deletion" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/data-deletion", baseMetadata);
}

export default function DataDeletionPageEn() {
  return <LegalPageView slug="data-deletion" lang="en" />;
}
