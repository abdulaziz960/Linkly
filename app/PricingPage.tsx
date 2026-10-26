import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "./LandingNav";
import ScrollReveal from "./ScrollReveal";
import PricingPlanGrid from "./PricingPlanGrid";
import PlanComparison from "./PlanComparison";
import PricingNotes from "./PricingNotes";
import SiteFooter from "./SiteFooter";
import JsonLd from "./JsonLd";
import { getActivePlansForLanding } from "../lib/plans";
import { getFaqs } from "../lib/faq-store";
import { planFeatures, getPlanDisplayItems } from "../lib/plan-features";
import { solutions, solutionPath } from "../lib/solution-content";
import s from "./page.module.css";
import c from "./landing/landing.module.css";

type Lang = "ar" | "en";

const planCta: Record<Lang, Record<string, string>> = {
  ar: {
    "باقة الأفراد": "ابدأ التجربة",
    "الباقة العادية": "جرّب الباقة العادية",
    "باقة المؤسسات الصغيرة": "جرّب باقة المؤسسات الصغيرة",
    "باقة المؤسسات الكبيرة": "جرّب باقة المؤسسات الكبيرة",
    "باقة الشركات": "تواصل معنا"
  },
  en: {
    "باقة الأفراد": "Start the trial",
    "الباقة العادية": "Try the Regular plan",
    "باقة المؤسسات الصغيرة": "Try the Small Enterprises plan",
    "باقة المؤسسات الكبيرة": "Try the Large Enterprises plan",
    "باقة الشركات": "Contact us"
  }
};

const copy = {
  ar: {
    title: "الأسعار | Linkly",
    kicker: "الأسعار",
    h1: "أسعار Linkly: باقة واضحة لكل مرحلة من نمو فريقك",
    intro: "ابدأ بتجربة مجانية لمدة 3 أيام بدون بطاقة دفع، ثم اختر السعة والأدوات المناسبة لفريقك. الأسعار شهرية وسنوية وبدون ضريبة القيمة المضافة.",
    metaDescription: (low: string, high: string) => `أسعار Linkly لصندوق واتساب وإنستغرام الموحّد: باقات من ${low} إلى ${high} ريال شهريًا، تجربة مجانية 3 أيام، وفرق الباقات من حيث الموظفين والقنوات والحملات.`,
    faqKicker: "الأسئلة الشائعة",
    faqTitle: "أسئلة عن الأسعار والباقات",
    moreKicker: "أدلة عملية",
    moreTitle: "قبل أن تختار، اقرأ كيف يُستخدم Linkly",
    ctaTitle: "جرّب الباقة المناسبة مجانًا لمدة 3 أيام",
    cta: "ابدأ تجربتك مجانًا",
    mobileCta: "ابدأ تجربتك مجانًا",
    blog: "المدونة",
    faq: "الأسئلة الشائعة",
    crumbs: ["الرئيسية", "الأسعار"]
  },
  en: {
    title: "Pricing | Linkly",
    kicker: "PRICING",
    h1: "Linkly pricing: a clear plan for every stage of your team's growth",
    intro: "Start with a free 3-day trial with no card, then choose the capacity and tools your team needs. Prices are monthly or yearly and exclude VAT.",
    metaDescription: (low: string, high: string) => `Linkly pricing for a shared WhatsApp and Instagram inbox: plans from ${low} to ${high} SAR per month, a free 3-day trial, and how plans differ in agents, channels and campaigns.`,
    faqKicker: "FAQ",
    faqTitle: "Questions about pricing and plans",
    moreKicker: "PRACTICAL GUIDES",
    moreTitle: "Before you choose, read how Linkly is used",
    ctaTitle: "Try the right plan free for 3 days",
    cta: "Start your free trial",
    mobileCta: "Start your free trial",
    blog: "Blog",
    faq: "FAQ",
    crumbs: ["Home", "Pricing"]
  }
} as const;

async function loadPlans(lang: Lang) {
  const dbPlans = await getActivePlansForLanding();
  const plans = dbPlans.map((plan) => {
    const features = planFeatures[plan.name];
    return {
      id: plan.id,
      name: features?.shortName[lang] ?? plan.name,
      price: String(plan.monthlyPrice),
      audience: features?.audience[lang] ?? (lang === "ar" ? "باقة مرنة تناسب احتياج فريقك." : "A flexible plan that fits your team's needs."),
      cta: planCta[lang][plan.name] ?? (lang === "ar" ? "ابدأ التجربة" : "Start the trial"),
      featured: features?.featured,
      custom: features?.custom,
      items: getPlanDisplayItems(plan, lang)
    };
  });
  const prices = dbPlans.filter((plan) => !planFeatures[plan.name]?.custom).map((plan) => plan.monthlyPrice).filter((price) => price > 0);
  return {
    dbPlans,
    plans,
    low: prices.length ? String(Math.min(...prices)) : "199",
    high: prices.length ? String(Math.max(...prices)) : "1599"
  };
}

export async function pricingMetadata(lang: Lang): Promise<Metadata> {
  const text = copy[lang];
  const { low, high } = await loadPlans(lang);
  const path = lang === "en" ? "/en/pricing" : "/pricing";
  const description = text.metaDescription(low, high);
  return {
    title: { absolute: text.title },
    description,
    alternates: { canonical: path, languages: { "ar-SA": "/pricing", en: "/en/pricing", "x-default": "/pricing" } },
    openGraph: { title: text.title, description, url: path, type: "website", locale: lang === "ar" ? "ar_SA" : "en_US", images: ["/opengraph-image?v=3"] },
    twitter: { card: "summary_large_image", title: text.title, description, images: ["/opengraph-image?v=3"] }
  };
}

export default async function PricingPage({ lang }: { lang: Lang }) {
  const text = copy[lang];
  const [{ dbPlans, plans, low, high }, faqs] = await Promise.all([loadPlans(lang), getFaqs(lang)]);
  const home = lang === "en" ? "/en" : "/";
  const path = lang === "en" ? "/en/pricing" : "/pricing";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Linkly",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `https://linklysa.io${path}`,
        offers: dbPlans.filter((plan) => plan.monthlyPrice > 0 && !planFeatures[plan.name]?.custom).map((plan) => ({
          "@type": "Offer",
          name: planFeatures[plan.name]?.shortName[lang] ?? plan.name,
          price: String(plan.monthlyPrice),
          priceCurrency: "SAR",
          priceSpecification: { "@type": "UnitPriceSpecification", price: String(plan.monthlyPrice), priceCurrency: "SAR", unitCode: "MON", valueAddedTaxIncluded: false }
        }))
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: text.crumbs[0], item: `https://linklysa.io${home === "/" ? "" : home}` },
          { "@type": "ListItem", position: 2, name: text.crumbs[1], item: `https://linklysa.io${path}` }
        ]
      }
    ]
  };

  return (
    <div className={s.page} dir={lang === "en" ? "ltr" : "rtl"} lang={lang}>
      <JsonLd data={jsonLd} />
      <ScrollReveal />
      <LandingNav lang={lang} />
      <main>
        <section className={`${s.section} ${s.pricing} ${c.dotGrid}`} id="pricing">
          <div className={s.intro}>
            <span>{text.kicker}</span>
            <h1>{text.h1}</h1>
            <p>{text.intro}</p>
          </div>
          <PricingPlanGrid plans={plans} lang={lang} />
          <PlanComparison plans={dbPlans} lang={lang} />
          <PricingNotes lang={lang} />
        </section>
        <section className={`${s.section} ${s.faq}`} id="faq">
          <div className={s.intro}><span>{text.faqKicker}</span><h2>{text.faqTitle}</h2></div>
          <div>{faqs.slice(0, 6).map(([question, answer], index) => <details key={question} open={index < 2}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
          <p><Link href={lang === "en" ? "/en/faq" : "/faq"}>{text.faq}</Link> · <Link href={lang === "en" ? "/en/blog" : "/blog"}>{text.blog}</Link></p>
        </section>
        <section className={s.section} id="guides">
          <div className={s.intro}><span>{text.moreKicker}</span><h2>{text.moreTitle}</h2></div>
          <div className={s.featureGrid}>
            {solutions.map((solution) => <article key={solution.slug}><h3><Link href={solutionPath(solution.slug, lang)}>{solution[lang].title}</Link></h3><p>{solution[lang].description}</p></article>)}
          </div>
        </section>
        <section className={s.finalCta}>
          <div>
            <h2>{text.ctaTitle}</h2>
            <Link href="/signup" data-primary-cta="true">{text.cta}</Link>
          </div>
        </section>
      </main>
      <SiteFooter lang={lang} />
      <Link className={s.mobileCta} href="/signup">{text.mobileCta}</Link>
    </div>
  );
}
