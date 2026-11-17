import type { Metadata } from "next";
import LegalPageView from "../LegalPageView";
import { applyPageSeo } from "../../lib/page-seo";

const baseMetadata: Metadata = {
  title: { absolute: "حذف البيانات | Linkly" },
  description: "طريقة طلب حذف حسابك وبيانات عملائك من منصة Linkly.",
  alternates: { canonical: "/data-deletion", languages: { "ar-SA": "/data-deletion", en: "/en/data-deletion", "x-default": "/data-deletion" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/data-deletion", baseMetadata);
}

export default function DataDeletionPage() {
  return <LegalPageView slug="data-deletion" lang="ar" />;
}
