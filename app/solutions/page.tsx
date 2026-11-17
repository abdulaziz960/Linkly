import type { Metadata } from "next";
import { SolutionsIndexView } from "../SolutionView";
import { applyPageSeo } from "../../lib/page-seo";

// The guides come from the admin panel (an edit shows up at once), so this is read on each request, never at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/solutions", {
    alternates: { canonical: "/solutions", languages: { "ar-SA": "/solutions", en: "/en/solutions", "x-default": "/solutions" } },
    openGraph: { url: "/solutions", type: "website", locale: "ar_SA", siteName: "Linkly" }
  });
}

export default function SolutionsPage() {
  return <SolutionsIndexView lang="ar" />;
}
