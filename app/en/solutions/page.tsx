import type { Metadata } from "next";
import { SolutionsIndexView } from "../../SolutionView";
import { applyPageSeo } from "../../../lib/page-seo";

// The guides come from the admin panel (an edit shows up at once), so this is read on each request, never at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/solutions", {
    alternates: { canonical: "/en/solutions", languages: { "ar-SA": "/solutions", en: "/en/solutions", "x-default": "/solutions" } },
    openGraph: { url: "/en/solutions", type: "website", locale: "en_US", siteName: "Linkly" }
  });
}

export default function SolutionsPage() {
  return <SolutionsIndexView lang="en" />;
}
