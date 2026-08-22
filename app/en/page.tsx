import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "../../public/assets/audiencew-logo.png";
import s from "../page.module.css";

export const metadata: Metadata = {
  title: "AudienceW — One inbox for customer conversations",
  description: "Bring WhatsApp, Instagram, email and Telegram conversations into one shared inbox for support and sales teams.",
  alternates: { canonical: "/en", languages: { "ar-SA": "/", en: "/en" } },
  openGraph: { locale: "en_US", alternateLocale: "ar_SA", url: "/en" }
};

const features = [
  ["Shared inbox", "Keep every conversation, owner and next step in one place."],
  ["Clear assignment", "Route conversations to the right employee or team."],
  ["Tags and status", "Organize follow-up without relying on memory."],
  ["Quick replies", "Answer repeated questions consistently and faster."],
  ["Automation", "Build welcome, routing and escalation rules."],
  ["Operational reports", "Track volume, response time and team activity."]
] as const;

const plans = [
  { name: "Starter", price: 249, users: "1 user", details: "Shared inbox, quick replies, tags and basic reports" },
  { name: "Growth", price: 499, users: "Up to 3 users", details: "Assignment, automation and performance reports" },
  { name: "Business", price: 999, users: "Up to 10 users", details: "Multiple teams, webhooks, API and priority support" }
];

export default function EnglishHomePage() {
  return (
    <div className={s.page} dir="ltr" lang="en">
      <header className={s.navbar}>
        <div className={s.navInner}>
          <Link className={s.brand} href="/en"><Image src={logo} alt="" width={38} height={38} />AudienceW</Link>
          <nav aria-label="Main navigation"><a href="#features">Features</a><a href="#pricing">Pricing</a><Link href="/">العربية</Link></nav>
          <div className={s.navActions}><Link href="/login">Sign in</Link><Link className={s.primary} href="/signup">Start free</Link></div>
        </div>
      </header>

      <main>
        <section className={s.hero}>
          <div>
            <span className={s.eyebrow}>One workspace for your team</span>
            <h1>Every customer conversation <strong>in one inbox</strong></h1>
            <p>WhatsApp, Instagram, email and Telegram — your team can reply, assign and follow up without switching between apps. TikTok messaging can be prepared after partner approval.</p>
            <div className={s.actions}><Link className={s.primaryLarge} href="/signup">Start your 14-day trial</Link><a className={s.secondary} href="#features">Explore the product</a></div>
            <small className={s.micro}>No card required · Guided channel setup · Cancel anytime</small>
          </div>
          <div className={s.inlineCta}><p><b>One customer context</b><span>Conversation, assignee, status and next action stay together.</span></p></div>
        </section>

        <section className={`${s.section} ${s.features}`} id="features">
          <div className={s.intro}><span>FEATURES</span><h2>Built around the work your team does every day</h2><p>Practical tools for support and sales teams, without unnecessary complexity.</p></div>
          <div className={s.featureGrid}>{features.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
        </section>

        <section className={`${s.section} ${s.pricing}`} id="pricing">
          <div className={s.intro}><span>PRICING</span><h2>Choose the capacity that fits your team</h2><p>Start with the free trial, then select a monthly plan.</p></div>
          <div className={s.planGrid}>{plans.map((plan, index) => <article className={index === 1 ? s.featured : ""} key={plan.name}>{index === 1 ? <span className={s.popular}>Most popular</span> : null}<h3>{plan.name}</h3><div className={s.price}><b>{plan.price}</b><span>SAR<br />per month</span></div><ul><li>{plan.users}</li><li>{plan.details}</li></ul><Link className={index === 1 ? s.primaryLarge : s.planButton} href="/signup">Start free</Link></article>)}</div>
        </section>

        <section className={s.finalCta}><div><span>START TODAY</span><h2>Let your team focus on the customer, not the apps.</h2><p>Try AudienceW free for 14 days.</p></div><div><Link href="/signup">Start your free trial</Link><small>No payment card required</small></div></section>
      </main>

      <footer className={s.footer}><div><section><Link className={s.brand} href="/en"><Image src={logo} alt="" width={38} height={38} />AudienceW</Link><p>A Saudi customer-conversation platform for support and sales teams.</p></section><nav><b>Legal</b><Link href="/en/privacy">Privacy</Link><Link href="/en/terms">Terms</Link></nav><nav><b>Company</b><Link href="/contact">Contact</Link><Link href="/">العربية</Link></nav></div><small>© 2026 Al-Jumhoor Custom Advertising Company. All rights reserved.</small></footer>
    </div>
  );
}
