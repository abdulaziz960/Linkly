import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import logo from "../../public/assets/linkly-logo.png";
import LandingNav from "../LandingNav";
import ScrollReveal from "../ScrollReveal";
import MobileCtaVisibility from "../MobileCtaVisibility";
import HtmlLangSync from "../HtmlLangSync";
import WhatsAppCta from "../WhatsAppCta";
import PricingPlanGrid from "../PricingPlanGrid";
import PlanComparison from "../PlanComparison";
import s from "../page.module.css";
import c from "../landing/landing.module.css";
import HeroScene from "../landing/HeroScene";
import ProblemMorph from "../landing/ProblemMorph";
import ProductStory from "../landing/ProductStory";
import ChannelHub from "../landing/ChannelHub";
import HowJourney from "../landing/HowJourney";
import { planFeatures, getPlanDisplayItems } from "../../lib/plan-features";
import { getActivePlansForLanding } from "../../lib/plans";
import { faqsEn } from "../../lib/faq";
// Shown on the landing metric ("5+ messaging platforms").
const platformCount = 5;

export const metadata: Metadata = {
  title: { absolute: "Linkly | One inbox for WhatsApp, Instagram and every channel — Saudi customer service platform" },
  description: "A Saudi platform that brings WhatsApp, Instagram, email, Telegram and TikTok conversations together, helping support and sales teams route and follow up from one place.",
  alternates: { canonical: "/en", languages: { "ar-SA": "/", en: "/en", "x-default": "/" } },
  openGraph: { title: "Linkly | Every customer conversation in one place", description: "A shared inbox, conversation routing, automation and reports for your team.", locale: "en_US", alternateLocale: "ar_SA", url: "/en", type: "website" }
};

// See app/page.tsx - same live-database pricing section; must be
// force-dynamic, not ISR, or the build-time prerender attempt fails against
// the Docker build's placeholder DATABASE_URL.
export const dynamic = "force-dynamic";

const features = [
  ["Shared inbox", "Save time instead of switching apps; every message and customer history lives in one place."],
  ["Conversation routing", "No message goes unanswered; every conversation has a clear owner from the first moment."],
  ["Statuses and tags", "Know instantly what needs follow-up today instead of reviewing every conversation by hand."],
  ["Team collaboration", "Your team works without duplicate replies or conflicts, because everyone sees the same context."],
  ["Replies and automation", "Your team replies faster without retyping the same answer, and complex cases route automatically."],
  ["Operational reports", "See where delays and opportunities are with real numbers, not guesswork."]
] as const;
const faqs = faqsEn;
const productSteps = [["01", "The full conversation is right there", "Messages, channel, tags and status without switching screens."], ["02", "The owner is always known", "Assign the conversation to an employee or team and track the work."], ["03", "The next step is clear", "Move it into sales follow-up, support, or escalation."]] as const;
const howSteps = [["1", "Create your account", "Start the trial and complete your business details."], ["2", "Connect your channels", "Set up the channels available for your business."], ["3", "Add your team", "Define employees, teams and permissions."], ["4", "Start replying", "Route conversations and track performance."]] as const;
const channelDescriptions = {
  whatsapp: "Customer conversations, templates and attachments via the Cloud API.",
  instagram: "Receive messages, keep customer context, and reply from the same space.",
  facebook: "Receive your Facebook page messages and reply from the same inbox.",
  telegram: "Connect the bot, receive messages, and route them securely.",
  email: "Connect Gmail to send and receive.",
  tiktok: "Connect your TikTok account and follow comments and messages from the same inbox."
};
// CTA text stays page-local; name/audience/items/featured come from
// lib/plan-features.ts, the same source app/billing/BillingClient.tsx reads.
const planCta: Record<string, string> = {
  "باقة الأفراد": "Start the trial",
  "الباقة العادية": "Try the Regular plan",
  "باقة المؤسسات الصغيرة": "Try the Small Enterprises plan",
  "باقة المؤسسات الكبيرة": "Try the Large Enterprises plan",
  "باقة الشركات": "Contact us"
};

function Check() { return <span className={s.check} aria-hidden="true">✓</span>; }
export default async function EnglishHomePage() {
  const dbPlans = await getActivePlansForLanding();
  const plans = dbPlans.map((plan) => {
    const features = planFeatures[plan.name];
    return {
      id: plan.id,
      name: features?.shortName.en ?? plan.name,
      price: String(plan.monthlyPrice),
      audience: features?.audience.en ?? "A flexible plan that fits your team's needs.",
      cta: planCta[plan.name] ?? "Start the trial",
      featured: features?.featured,
      items: getPlanDisplayItems(plan, "en")
    };
  });
  const prices = dbPlans.map((plan) => plan.monthlyPrice).filter((price) => price > 0);
  const lowPrice = prices.length ? String(Math.min(...prices)) : "199";
  const highPrice = prices.length ? String(Math.max(...prices)) : "1599";
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", name: "Linkly", alternateName: ["Linkly Saudi", "Linkly السعودية", "لنكلي"], url: "https://linklysa.io", logo: "https://linklysa.io/assets/linkly-logo.png", description: "Linkly is a Saudi customer communication and customer support platform that helps businesses manage WhatsApp conversations, shared team inboxes, customer support, tickets, live chat, automation, and digital customer communication from one centralized platform.", areaServed: "SA" },
    { "@type": "WebSite", name: "Linkly", url: "https://linklysa.io", inLanguage: ["ar-SA", "en"] },
    { "@type": "SoftwareApplication", name: "Linkly", applicationCategory: "BusinessApplication", operatingSystem: "Web", offers: { "@type": "AggregateOffer", lowPrice, highPrice, priceCurrency: "SAR" } },
    { "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }
  ] };
  return <div className={s.page} dir="ltr" lang="en">
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
  <HtmlLangSync lang="en" dir="ltr" />
  <ScrollReveal />
  <MobileCtaVisibility />
  <LandingNav lang="en" />
  <main>
    <section className={s.hero}><span className={s.heroAurora} aria-hidden="true"/><div><span className={s.eyebrow}>One workspace for your whole team</span><h1>Reply faster to customers <strong>and never lose a conversation</strong></h1><p>WhatsApp, Instagram, Facebook, Telegram, email and more of your messaging platforms — your team replies, routes and follows up from one inbox.</p><div className={s.actions}><Link className={s.primaryLarge} href="/signup" data-primary-cta="true">Start your free trial</Link><WhatsAppCta pageId="home-en" linkId="hero-whatsapp" message="Hi, I'd like to learn more about Linkly" className={s.whatsappCta}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Zm-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.16 6.44 6.6 2 12.05 2c2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.89-9.88 9.89ZM20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.42Z"/></svg>Chat on WhatsApp</WhatsAppCta></div><a className={s.secondary} href="#product">See how it works ←</a><small className={s.micro}><Check /> 3 days free <Check /> No card required <Check /> We set up your channels for you</small><div className={s.heroMetrics}><div><b><span className={c.countUp} style={{ "--to": platformCount } as CSSProperties} aria-hidden="true" /><span className={c.srOnly}>{platformCount}</span>+</b><span>messaging platforms in one inbox that you can connect and manage directly, with no extra steps</span></div><div><b>1</b><span>Inbox for the whole team</span></div><div><b>∞</b><span>Clear context for every conversation</span></div></div></div><HeroScene lang="en" /></section>
    <section className={s.trust}><b>Built for support and sales teams</b><span><Check /> Faster replies</span><span><Check /> A clear owner</span><span><Check /> Follow-up that doesn't slip</span><span><Check /> Team permissions</span></section>
    <section className={`${s.section} ${s.problem}`}><Intro kicker="THE PROBLEM" title="Multiple channels. Dozens of conversations. One team trying to keep up." copy="Switching between apps and phones slows down replies, hides who owns what, and makes follow-up depend on memory."/><ProblemMorph lang="en" title="One inbox" text="Full context, clear routing, and follow-up from one place." /></section>
    <section className={`${s.section} ${s.product}`} id="product"><Intro kicker="THE PRODUCT" title="One interface showing exactly what your team needs right now" copy="From the first message to close, the conversation, customer, owner and next step all stay in the same context."/><ProductStory lang="en" steps={productSteps} /></section>
    <section className={`${s.section} ${s.channels} ${c.dotGrid}`}><Intro kicker="CHANNELS" title="Every channel on its own terms. One place to manage them." copy="Turn on the channels your business needs, and let the team work from a single inbox."/><ChannelHub lang="en" descriptions={channelDescriptions} /></section>
    <section className={`${s.section} ${s.features}`} id="features"><Intro kicker="FEATURES" title="Everything your team needs to manage conversations clearly" copy="Practical tools built around the daily workflow, not a long list of theoretical features."/><div className={s.featureGrid}>{features.map(([title, copy], i) => <article key={title} className={s.reveal} style={{ transitionDelay: `${i * 60}ms` }}><span>0{i + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div><div className={s.inlineCta}><p><b>Ready to bring your team's conversations together?</b><span>Start with a free account, then set up your channels step by step.</span></p><Link className={s.primary} href="/signup" data-primary-cta="true">Start your free trial</Link></div></section>
    <section className={`${s.section} ${c.howSection} ${c.dotGrid}`} id="how"><Intro kicker="HOW IT WORKS" title="Get started in four steps" copy="A clear path from creating your account to your team's first managed conversation."/><HowJourney lang="en" steps={howSteps} /></section>
    <section className={`${s.section} ${s.useCases}`}><Intro kicker="USE CASES" title="From the first inquiry to a served customer" /><div>{[["↗", "Sales", "A customer comes in from WhatsApp or Instagram, gets assigned to a sales rep, and their next step is saved.", "Lead ← Assign ← Follow up"], ["◎", "Customer service", "An inquiry or complaint lands in the inbox and moves to the right team with full context.", "Message ← Team ← Resolve"], ["⌁", "Operations & follow-up", "Rules, quick replies and business hours cut delays and keep the experience consistent.", "Rule ← Action ← Measure"]].map((x, i) => <article key={x[1]} className={s.reveal} style={{ transitionDelay: `${i * 80}ms` }}><i>{x[0]}</i><h3>{x[1]}</h3><p>{x[2]}</p><small dir="ltr">{x[3]}</small></article>)}</div></section>
    <section className={`${s.section} ${s.security}`}><Intro kicker="SECURITY & TRUST" title="Your customers' data deserves business-grade protection" copy="Protection is a core part of the product, from signing in to connecting your channels."/><div>{[["01", "Encrypted secrets", "Your channel connection data is protected and encrypted, and never shown in full in the interface."], ["02", "Permissions and activity logs", "Every employee gets their own permissions, and you get a log of every important action on your account."], ["03", "Message source verification", "We confirm every message genuinely comes from the official channel before accepting it."], ["04", "Secure login sessions", "Time-limited sessions, and passwords are always stored with strong encryption."]].map((x, i) => <article key={x[0]} className={s.reveal} style={{ transitionDelay: `${i * 70}ms` }}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></article>)}</div></section>
    <section className={`${s.section} ${s.pricing}`} id="pricing"><Intro kicker="PRICING" title="A clear plan for every stage of your team's growth" copy="Start with the free trial first, then choose the capacity and tools that fit how you work."/><PricingPlanGrid plans={plans} lang="en"/>
      <PlanComparison plans={dbPlans} lang="en"/>
      <div className={`${s.metaSetup} ${s.revealFade}`}><span className={s.metaSetupGlow} aria-hidden="true"/><div className={s.metaSetupBadge}><b>500</b><span>SAR<br/>one time</span></div><div className={s.metaSetupBody}><h2>Don't have a Facebook account or Meta Business Manager?</h2><p>We set up the account and connect WhatsApp Business for you, end to end — an optional add-on. <Link className={s.metaSetupLink} href="/en/contact">See details<span aria-hidden="true">←</span></Link></p><p className={s.metaSetupNote}>The service fee is paid once and doesn't include Meta fees or any third-party provider fees, if any.</p></div></div>
      <p className={s.whatsappNote}><b>WhatsApp fees:</b> Official message fees from Meta, if any, are separate from the Linkly subscription.</p>
    </section>
    <section className={`${s.section} ${s.faq}`} id="faq"><Intro kicker="FAQ" title="Clear answers before you start" /><div>{faqs.map(([q, a], i) => <details key={q} open={i < 2}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={`${s.finalCta} ${s.revealFade}`}><div><span>START TODAY</span><h2>Let your team focus on the customer, not on switching between apps.</h2><p>Try Linkly free for 3 days.</p></div><div><Link href="/signup" data-primary-cta="true">Start your free trial</Link><small>No card required</small></div></section>
  </main>
  <footer className={s.footer}><div><section><Link className={s.brand} href="/en"><Image src={logo} alt="" width={56} height={31} /><span>Linkly</span></Link><p>Linkly is a Saudi platform that brings your customer conversations from WhatsApp, Instagram, email, Telegram and more into one shared inbox, routes them to your team, escalates overdue conversations automatically, replies on your behalf, and manages your campaigns, products, branches and reports in one place.</p></section><nav><b>Product</b><a href="#features">Features</a><a href="#how">How it works</a><a href="#pricing">Pricing</a><Link href="/en/faq">FAQ</Link><Link href="/en/blog">Blog</Link></nav><nav><b>Company</b><Link href="/en/privacy">Privacy</Link><Link href="/en/terms">Terms of use</Link><Link href="/en/data-deletion">Data deletion</Link><Link href="/en/contact">Contact us</Link></nav></div><small>All rights reserved to Al-Jumhoor Custom Advertising Company.　 Linkly © 2026</small></footer>
  <Link className={s.mobileCta} href="/signup">Start your free trial</Link>
</div>; }

function Intro({ kicker, title, copy }: { kicker: string; title: string; copy?: string }) { return <div className={s.intro}><span>{kicker}</span><h2>{title}</h2>{copy ? <p>{copy}</p> : null}</div>; }
