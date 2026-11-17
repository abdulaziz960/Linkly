import { localizedSolutions, solutionPath } from "./solution-content";
import { getPublicSolutions } from "./solution-store";

export type SiteLink = { path: string; label: string };

/** The pages an article can link to from the editor's link picker (blog posts are added by the editor from its own list). */
export async function siteLinkSuggestions(lang: "ar" | "en"): Promise<SiteLink[]> {
  const en = lang === "en";
  const base = en ? "/en" : "";
  return [
    { path: en ? "/en" : "/", label: en ? "Home" : "الرئيسية" },
    { path: `${base}/pricing`, label: en ? "Pricing" : "الأسعار" },
    { path: `${base}/faq`, label: en ? "FAQ" : "الأسئلة الشائعة" },
    { path: `${base}/contact`, label: en ? "Contact" : "تواصل معنا" },
    { path: `${base}/blog`, label: en ? "Blog" : "المدونة" },
    ...localizedSolutions(await getPublicSolutions(), lang).map((guide) => ({ path: solutionPath(guide.slug, lang), label: guide.content.title }))
  ];
}
