import Link from "next/link";
import { localizedSolutions, solutionPath, type Solution } from "../lib/solution-content";
import { getPublicSolutions } from "../lib/solution-store";
import { Breadcrumbs, withLinks } from "./content-links";
import ContentShell from "./ContentShell";
import JsonLd from "./JsonLd";

export async function SolutionLinks({ lang, exclude }: { lang: "ar" | "en"; exclude?: string }) {
  const guides = localizedSolutions(await getPublicSolutions(), lang).filter((guide) => guide.slug !== exclude);
  return <nav className="solution-links" aria-label={lang === "ar" ? "أدلة القنوات والتكاملات" : "Channel and integration guides"}>
    {guides.map((guide) => <Link key={guide.slug} href={solutionPath(guide.slug, lang)}><strong>{guide.content.title}</strong><span>{guide.content.description}</span><em aria-hidden="true">{lang === "ar" ? "اقرأ الدليل ←" : "Read the guide →"}</em></Link>)}
  </nav>;
}

/** The page that lists every guide, as cards. */
export function SolutionsIndexView({ lang }: { lang: "ar" | "en" }) {
  const en = lang === "en";
  return <ContentShell lang={lang}>
    <Breadcrumbs lang={lang} items={[{ name: en ? "Home" : "الرئيسية", path: en ? "/en" : "/" }, { name: en ? "Solutions" : "الحلول" }]} />
    <h1>{en ? "Linkly solutions" : "حلول لنكلي"}</h1>
    <p>{en ? "Practical guides for the channel or business you run: what to set up, what to test, and what to check before you start." : "أدلة عملية حسب قناتك ونشاطك: ماذا تجهّز، وماذا تختبر، وما الذي تراجعه قبل أن تبدأ."}</p>
    <SolutionLinks lang={lang} />
    <ProductNextSteps lang={lang} />
  </ContentShell>;
}

export function ProductNextSteps({ lang }: { lang: "ar" | "en" }) {
  const en = lang === "en";
  return <aside className="legal-contact">
    <h2>{en ? "Choose your next step" : "اختر خطوتك التالية"}</h2>
    <p>{en ? "Review the channels and capacity you need, or ask us to walk through your workflow. The three-day trial starts when you create your account." : "راجع القنوات وسعة الفريق التي تحتاجها، أو اطلب شرحًا يناسب سير عملك. التجربة ثلاثة أيام تبدأ عند إنشاء الحساب."}</p>
    <nav className="legal-links">
      <Link href={`${en ? "/en" : "/"}#pricing`}>{en ? "Compare plans and fees" : "قارن الباقات والرسوم"}</Link>
      <Link href={en ? "/en/contact" : "/contact"}>{en ? "Request a walkthrough" : "اطلب عرضًا توضيحيًا"}</Link>
      <Link href="/signup" data-primary-cta="true">{en ? "Start your free trial" : "ابدأ تجربتك مجانًا"}</Link>
    </nav>
  </aside>;
}

export default function SolutionView({ solution, lang }: { solution: Solution; lang: "ar" | "en" }) {
  const content = solution[lang]!; // the page only renders a guide that has this language
  const en = lang === "en";
  return <ContentShell lang={lang}>
    <Breadcrumbs lang={lang} items={[{ name: en ? "Home" : "الرئيسية", path: en ? "/en" : "/" }, { name: en ? "Solutions" : "الحلول", path: en ? "/en/solutions" : "/solutions" }, { name: content.title }]} />
    <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: content.title, description: content.description, inLanguage: en ? "en" : "ar-SA", url: `https://linklysa.io${solutionPath(solution.slug, lang)}` }} />
    <p className="post-meta">{en ? "Practical product guide · Linkly" : "دليل عملي للمنتج · لنكلي"}</p>
    <h1>{content.title}</h1>
    <p>{content.description}</p>
    {solution[en ? "ar" : "en"] ? <Link href={solutionPath(solution.slug, en ? "ar" : "en")} hrefLang={en ? "ar" : "en"}>{en ? "العربية" : "English"}</Link> : null}
    {content.sections.map((section, index) => <section key={`${index}-${section.title}`}>
      {section.title ? <h2>{section.title}</h2> : null}
      {section.paragraphs.map((paragraph, at) => <p key={at}>{withLinks(paragraph)}</p>)}
    </section>)}
    {content.checklist.length ? <section><h2>{en ? "Before you start" : "قبل أن تبدأ"}</h2><ul className="solution-checklist">{content.checklist.map((item) => <li key={item}>{withLinks(item)}</li>)}</ul></section> : null}
    <ProductNextSteps lang={lang} />
    <h2>{en ? "Explore another workflow" : "تعرّف على استخدامات أخرى"}</h2>
    <SolutionLinks lang={lang} exclude={solution.slug} />
  </ContentShell>;
}
