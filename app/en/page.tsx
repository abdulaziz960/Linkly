import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "../../public/assets/linkly-logo.png";
import LandingNav from "../LandingNav";
import s from "../page.module.css";

export const metadata: Metadata = {
  title: "Linkly | Every customer conversation, one inbox",
  description: "A Saudi platform that brings WhatsApp, Instagram, email, Telegram and TikTok conversations together, helping support and sales teams route and follow up from one place.",
  alternates: { canonical: "/en", languages: { "ar-SA": "/", en: "/en" } },
  openGraph: { title: "Linkly | Every customer conversation in one place", description: "A shared inbox, conversation routing, automation and reports for your team.", locale: "en_US", alternateLocale: "ar_SA", url: "/en", type: "website" }
};

const features = [
  ["Shared inbox", "Bring conversations into one workspace with a clear history for every customer."],
  ["Conversation routing", "Assign every conversation to an employee or team and know who owns it instantly."],
  ["Statuses and tags", "Organize follow-up with statuses, tags and the next step."],
  ["Team collaboration", "Shared permissions and context stop duplicate replies or a conversation slipping through."],
  ["Replies and automation", "Quick replies plus welcome, routing and escalation rules cut manual work."],
  ["Operational reports", "Track conversation volume, response time, team performance and customer stages."]
] as const;
const faqs = [
  ["Can I use more than one employee?", "Yes. Add employees and set their roles, teams and permissions from one dashboard."],
  ["Can I connect my existing WhatsApp number?", "It depends on the number's status and Meta's WhatsApp Cloud API requirements — we help you review the connection path."],
  ["Do I need a new WhatsApp number?", "Not always. We review your current number's status first, then decide the best path."],
  ["Do you support the WhatsApp Business API?", "Yes, the operational connection is built on Meta's official WhatsApp Cloud API."],
  ["Is there an API?", "Webhooks and integration interfaces are available on the Growth plan, depending on the integration scope needed."],
  ["Can I cancel my subscription?", "Cancellation can be scheduled for the end of the current period from the billing screen."],
  ["Is there a setup fee?", "Setting up Meta accounts and the full connection is optional and costs SAR 500 one time."],
  ["How are WhatsApp fees calculated?", "Official WhatsApp message fees from Meta, if any, are separate from the Linkly subscription."],
  ["Is customer data safe?", "The platform uses user permissions, encryption for integration secrets, time-limited sessions, and activity logs to help track activity."]
] as const;
const plans = [
  { name: "Starter", price: "249", cta: "Start the trial", items: ["1 user", "Shared inbox", "Quick replies and tags", "Basic reports"] },
  { name: "Growth", price: "499", cta: "Try the Growth plan", featured: true, items: ["Up to 3 users", "Conversation routing", "Auto reply and routing rules", "Performance and SLA reports"] },
  { name: "Business", price: "999", cta: "Try the Business plan", items: ["Up to 10 users", "Multiple teams", "Webhooks and API", "Priority support"] }
] as const;
const jsonLd = { "@context": "https://schema.org", "@graph": [
  { "@type": "Organization", name: "Linkly", url: "https://audiencew.audience.sa", logo: "https://audiencew.audience.sa/assets/linkly-logo.png" },
  { "@type": "SoftwareApplication", name: "Linkly", applicationCategory: "BusinessApplication", operatingSystem: "Web", offers: { "@type": "AggregateOffer", lowPrice: "249", highPrice: "999", priceCurrency: "SAR" } },
  { "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }
] };

function Check() { return <span className={s.check} aria-hidden="true">✓</span>; }
type Platform = "whatsapp" | "instagram" | "email" | "telegram" | "tiktok";
function PlatformLogo({ platform }: { platform: Platform }) {
  if (platform === "instagram") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" className={s.logoDot} /></svg>;
  if (platform === "email") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>;
  if (platform === "telegram") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><path className={s.logoFill} d="M21.4 3.2 18.2 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.3 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.1c.4-.4-.1-.6-.6-.2L5.8 13.7 1 12.2c-1-.3-1.1-1 .2-1.5L20 3.4c.9-.3 1.7.2 1.4-.2Z" /></svg>;
  if (platform === "tiktok") return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><path className={s.logoFill} d="M15.2 3c.4 2.3 1.7 3.7 3.8 4.1v3.2a9 9 0 0 1-3.8-1.2v6.1a5.8 5.8 0 1 1-5-5.7v3.3a2.6 2.6 0 1 0 1.8 2.5V3h3.2Z" /></svg>;
  return <svg className={s.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.7a8 8 0 0 1-11.8 7l-4.2 1.1 1.1-4.1A8 8 0 1 1 20 11.7Z" /><path d="M9 8.5c.3 2.8 2 4.6 4.8 5.5.5.1 1.3-.8 1.5-1.2" /></svg>;
}
function Preview() {
  return <div className={s.preview} aria-label="Preview of the Linkly conversation inbox">
    <header><div><i /><i /><i /></div><b>Linkly Inbox</b><span>Online</span></header>
    <div className={s.previewBody}><aside><Image src={logo} alt="" width={34} height={34} /><b>⌁</b><b>◎</b><b>♢</b><b>⚙</b></aside>
      <section className={s.conversations}><h3>Conversations <small>12 new</small></h3>{[["W", "Waleed Alsubaie", "Is the product available today?", "WhatsApp"], ["N", "Noura Ahmed", "I got your message from the ad", "Instagram"], ["S", "Smart Co.", "Requesting a quote for the team", "Email"], ["M", "Mohammed Ali", "I need help with my order", "Telegram"], ["R", "Reem Khaled", "Interested in connecting after TikTok approval", "TikTok"]].map((x, i) => <article className={i === 0 ? s.selected : ""} key={x[1]}><em>{x[0]}</em><div><b>{x[1]}</b><p>{x[2]}</p><small>{x[3]} · now</small></div></article>)}</section>
      <section className={s.chat}><header><div><b>Waleed Alsubaie</b><small>Open conversation</small></div><span>Sales team</span></header><div><p>Hello, is the product available today?</p><p>Hello, yes it's available. Sending you the order link now.</p><small>Interested customer　 follow up today</small></div><footer>Type your reply here… <b>↑</b></footer></section></div>
  </div>;
}

export default function EnglishHomePage() { return <div className={s.page} dir="ltr" lang="en">
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
  <LandingNav lang="en" />
  <main>
    <section className={s.hero}><div><span className={s.eyebrow}><i /> One workspace for your whole team</span><h1>Every customer conversation <strong>in one place</strong></h1><p>WhatsApp, Instagram, email and Telegram — your team replies, routes and follows up from one inbox, with TikTok readiness once messaging access is approved.</p><div className={s.actions}><Link className={s.primaryLarge} href="/signup">Start your free trial</Link><a className={s.secondary} href="#product">See how it works ←</a></div><small className={s.micro}><Check /> 3 days free <Check /> No card required <Check /> We set up your channels for you</small><div className={s.heroMetrics}><div><b>4+</b><span>Channels ready for your team</span></div><div><b>1</b><span>Inbox for the whole team</span></div><div><b>∞</b><span>Clear context for every conversation</span></div></div></div><Preview /></section>
    <section className={s.trust}><b>Built for support and sales teams</b><span><Check /> Faster replies</span><span><Check /> A clear owner</span><span><Check /> Follow-up that doesn't slip</span><span><Check /> Team permissions</span></section>
    <section className={`${s.section} ${s.problem}`}><Intro kicker="THE PROBLEM" title="Multiple channels. Dozens of conversations. One team trying to keep up." copy="Switching between apps and phones slows down replies, hides who owns what, and makes follow-up depend on memory."/><div className={s.problemVisual}><div className={s.channelMarks}><i title="WhatsApp"><PlatformLogo platform="whatsapp" /></i><i title="Instagram"><PlatformLogo platform="instagram" /></i><i title="Email"><PlatformLogo platform="email" /></i><i title="Telegram"><PlatformLogo platform="telegram" /></i><i title="TikTok"><PlatformLogo platform="tiktok" /></i></div><span>←</span><article><Image src={logo} alt="" width={48} height={48} /><div><b>One inbox</b><p>Full context, clear routing, and follow-up from one place.</p></div></article></div></section>
    <section className={`${s.section} ${s.product}`} id="product"><Intro kicker="THE PRODUCT" title="One interface showing exactly what your team needs right now" copy="From the first message to close, the conversation, customer, owner and next step all stay in the same context."/><div className={s.productGrid}><div className={s.numberList}>{[["01", "The full conversation is right there", "Messages, channel, tags and status without switching screens."], ["02", "The owner is always known", "Assign the conversation to an employee or team and track the work."], ["03", "The next step is clear", "Move it into sales follow-up, support, or escalation."]].map(x => <article key={x[0]}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></article>)}</div><Preview /></div></section>
    <section className={`${s.section} ${s.channels}`}><Intro kicker="CHANNELS" title="Every channel on its own terms. One place to manage them." copy="Turn on the channels your business needs, and let the team work from a single inbox."/><div className={s.channelsGrid}>{[["whatsapp", "WhatsApp", "Customer conversations, templates and attachments via the Cloud API."], ["instagram", "Instagram", "Receive messages, keep customer context, and reply from the same space."], ["email", "Email", "Connect Gmail or Outlook to send and receive."], ["telegram", "Telegram", "Connect the bot, receive messages, and route them securely."], ["tiktok", "TikTok", "Ready to set up once your business gets TikTok Business Messaging approval."]].map(x => <article key={x[1]}><i><PlatformLogo platform={x[0] as Platform} /></i><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div></section>
    <section className={`${s.section} ${s.features}`} id="features"><Intro kicker="FEATURES" title="Everything your team needs to manage conversations clearly" copy="Practical tools built around the daily workflow, not a long list of theoretical features."/><div className={s.featureGrid}>{features.map(([title, copy], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div><div className={s.inlineCta}><p><b>Ready to bring your team's conversations together?</b><span>Start with a free account, then set up your channels step by step.</span></p><Link className={s.primary} href="/signup">Start your free trial</Link></div></section>
    <section className={`${s.section} ${s.how}`} id="how"><Intro kicker="HOW IT WORKS" title="Get started in four steps" copy="A clear path from creating your account to your team's first managed conversation."/><ol>{[["1", "Create your account", "Start the trial and complete your business details."], ["2", "Connect your channels", "Set up the channels available for your business."], ["3", "Add your team", "Define employees, teams and permissions."], ["4", "Start replying", "Route conversations and track performance."]].map(x => <li key={x[0]}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></li>)}</ol></section>
    <section className={`${s.section} ${s.useCases}`}><Intro kicker="USE CASES" title="From the first inquiry to a served customer" /><div>{[["↗", "Sales", "A customer comes in from WhatsApp or Instagram, gets assigned to a sales rep, and their next step is saved.", "Lead ← Assign ← Follow up"], ["◎", "Customer service", "An inquiry or complaint lands in the inbox and moves to the right team with full context.", "Message ← Team ← Resolve"], ["⌁", "Operations & follow-up", "Rules, quick replies and business hours cut delays and keep the experience consistent.", "Rule ← Action ← Measure"]].map(x => <article key={x[1]}><i>{x[0]}</i><h3>{x[1]}</h3><p>{x[2]}</p><small dir="ltr">{x[3]}</small></article>)}</div></section>
    <section className={`${s.section} ${s.security}`}><Intro kicker="SECURITY & TRUST" title="Your customers' data deserves business-grade protection" copy="Protection is part of the product architecture: from sessions and permissions to integration secrets and channel event verification."/><div>{[["01", "Encrypted secrets", "Sensitive channel connection data is encrypted and shown masked in the interface."], ["02", "Permissions and activity logs", "Clear roles and logging for important operational events."], ["03", "Webhook verification", "Meta and X events are rejected if they don't carry the provider's correct signature."], ["04", "Secure sessions and passwords", "Time-limited sessions and passwords stored with the scrypt algorithm and a unique salt."]].map(x => <article key={x[0]}><span>{x[0]}</span><div><h3>{x[1]}</h3><p>{x[2]}</p></div></article>)}</div></section>
    <section className={`${s.section} ${s.pricing}`} id="pricing"><Intro kicker="PRICING" title="A clear plan for every stage of your team's growth" copy="Start with the free trial first, then choose the capacity and tools that fit how you work."/><div className={s.planGrid}>{plans.map(p => { const featured = "featured" in p && p.featured; return <article className={featured ? s.featured : ""} key={p.name}>{featured ? <span className={s.popular}>Most popular</span> : null}<h3>{p.name}</h3><div className={s.price}><b>{p.price}</b><span>SAR<br />/ month</span></div><ul>{p.items.map(i => <li key={i}><Check />{i}</li>)}</ul><Link className={featured ? s.primaryLarge : s.planButton} href="/signup">{p.cta}</Link></article>; })}</div>
      <div className={s.metaSetup}><div className={s.metaSetupHead}><div className={s.metaSetupBadge}><b>500</b><span>SAR one time</span></div><div><h2>Don't have a Facebook account or Business Manager?</h2><p>We set up everything you need from the start: creating the required accounts, preparing Meta Business, connecting WhatsApp Business, and helping you until the number is ready to use inside Linkly.</p></div></div><div className={s.metaSetupSteps}>{["Creating and setting up the required Facebook account", "Setting up Meta Business Manager", "Preparing WhatsApp Business and connecting the number", "Reviewing the basic setup and going live"].map(step => <span key={step}>{step}</span>)}</div><p className={s.metaSetupNote}>The service fee is paid once and doesn't include Meta fees or any government or third-party provider fees, if any.</p></div>
      <p className={s.whatsappNote}><b>WhatsApp fees:</b> Official message fees from Meta, if any, are separate from the Linkly subscription.</p>
    </section>
    <section className={`${s.section} ${s.faq}`} id="faq"><Intro kicker="FAQ" title="Clear answers before you start" /><div>{faqs.map(([q, a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={s.finalCta}><div><span>START TODAY</span><h2>Let your team focus on the customer, not on switching between apps.</h2><p>Try Linkly free for 3 days.</p></div><div><Link href="/signup">Start your free trial</Link><small>No card required</small></div></section>
  </main>
  <footer className={s.footer}><div><section><Link className={s.brand} href="/en"><Image src={logo} alt="" width={38} height={38} /><span>Linkly</span></Link><p>A platform for managing customer conversations and running support and sales teams from one place.</p></section><nav><b>Product</b><a href="#features">Features</a><a href="#how">How it works</a><a href="#pricing">Pricing</a></nav><nav><b>Company</b><Link href="/en/privacy">Privacy</Link><Link href="/en/terms">Terms of use</Link><Link href="/en/data-deletion">Data deletion</Link><Link href="/en/contact">Contact us</Link></nav></div><small>All rights reserved to Al-Jumhoor Custom Advertising Company.　 Linkly © 2026</small></footer>
  <Link className={s.mobileCta} href="/signup">Start your free trial</Link>
</div>; }

function Intro({ kicker, title, copy }: { kicker: string; title: string; copy?: string }) { return <div className={s.intro}><span>{kicker}</span><h2>{title}</h2>{copy ? <p>{copy}</p> : null}</div>; }
