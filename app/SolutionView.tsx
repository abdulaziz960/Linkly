import Link from "next/link";
import { solutions, solutionPath, type Solution } from "../lib/solution-content";
import ContentShell from "./ContentShell";
import JsonLd from "./JsonLd";

export function SolutionLinks({ lang }: { lang: "ar" | "en" }) {
  return <nav className="solution-links" aria-label={lang === "ar" ? "أدلة القنوات والتكاملات" : "Channel and integration guides"}>
    {solutions.map((solution) => <Link key={solution.slug} href={solutionPath(solution.slug, lang)}>{solution[lang].title}</Link>)}
  </nav>;
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
  const content = solution[lang];
  const en = lang === "en";
  return <ContentShell lang={lang}>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: content.title, description: content.description, inLanguage: en ? "en" : "ar-SA", url: `https://linklysa.io${solutionPath(solution.slug, lang)}` }} />
    <p className="post-meta">{en ? "Practical product guide · Linkly" : "دليل عملي للمنتج · لنكلي"}</p>
    <h1>{content.title}</h1>
    <p>{content.description}</p>
    <Link href={solutionPath(solution.slug, en ? "ar" : "en")} hrefLang={en ? "ar" : "en"}>{en ? "العربية" : "English"}</Link>
    {content.sections.map((section) => <section key={section.title}>
      <h2>{section.title}</h2>
      {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </section>)}
    <section><h2>{en ? "Before you start" : "قبل أن تبدأ"}</h2><ul>{content.checklist.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <ProductNextSteps lang={lang} />
    <h2>{en ? "Explore another workflow" : "تعرّف على استخدامات أخرى"}</h2>
    <SolutionLinks lang={lang} />
  </ContentShell>;
}
