import { solutions, solutionPath } from "./solution-content";

export type SiteLink = { path: string; label: string };

/** The pages an article can link to from the editor's link picker (blog posts are added by the editor from its own list). */
export function siteLinkSuggestions(lang: "ar" | "en"): SiteLink[] {
  const en = lang === "en";
  const base = en ? "/en" : "";
  return [
    { path: en ? "/en" : "/", label: en ? "Home" : "الرئيسية" },
    { path: `${base}/pricing`, label: en ? "Pricing" : "الأسعار" },
    { path: `${base}/faq`, label: en ? "FAQ" : "الأسئلة الشائعة" },
    { path: `${base}/contact`, label: en ? "Contact" : "تواصل معنا" },
    { path: `${base}/blog`, label: en ? "Blog" : "المدونة" },
    ...solutions.map((solution) => ({ path: solutionPath(solution.slug, lang), label: solution[lang].title }))
  ];
}
