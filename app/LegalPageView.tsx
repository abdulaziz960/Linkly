import Link from "next/link";
import CookieSettingsLink from "./CookieSettingsLink";
import HtmlLangSync from "./HtmlLangSync";
import JsonLd from "./JsonLd";
import ContactActions from "./ContactActions";
import { withLinks } from "./content-links";
import { parseLegalBody } from "../lib/legal-body";
import { getLegalPage } from "../lib/legal-store";
import type { LegalSlug } from "../lib/legal-content";
import "./legal.css";

const SITE = "https://linklysa.io";
type Lang = "ar" | "en";
type NavLink = { href: string; label: string } | "cookies";

/** The links under each legal page: the other legal pages, cookie settings (privacy only), home and the other language. */
const NAV: Record<LegalSlug, Record<Lang, NavLink[]>> = {
  privacy: {
    ar: [{ href: "/terms", label: "شروط الاستخدام" }, { href: "/data-deletion", label: "حذف البيانات" }, "cookies", { href: "/", label: "الصفحة الرئيسية" }, { href: "/en/privacy", label: "English" }],
    en: [{ href: "/en/terms", label: "Terms of use" }, { href: "/en/data-deletion", label: "Data deletion" }, "cookies", { href: "/en", label: "Home" }, { href: "/privacy", label: "العربية" }]
  },
  terms: {
    ar: [{ href: "/privacy", label: "سياسة الخصوصية" }, { href: "/data-deletion", label: "حذف البيانات" }, { href: "/", label: "الصفحة الرئيسية" }, { href: "/en/terms", label: "English" }],
    en: [{ href: "/en/privacy", label: "Privacy policy" }, { href: "/en/data-deletion", label: "Data deletion" }, { href: "/en", label: "Home" }, { href: "/terms", label: "العربية" }]
  },
  contact: {
    ar: [{ href: "/", label: "الصفحة الرئيسية" }, { href: "/en/contact", label: "English" }],
    en: [{ href: "/en", label: "Home" }, { href: "/contact", label: "العربية" }]
  },
  "data-deletion": {
    ar: [{ href: "/privacy", label: "سياسة الخصوصية" }, { href: "/terms", label: "شروط الاستخدام" }, { href: "/", label: "الصفحة الرئيسية" }, { href: "/en/data-deletion", label: "English" }],
    en: [{ href: "/en/privacy", label: "Privacy policy" }, { href: "/en/terms", label: "Terms of use" }, { href: "/en", label: "Home" }, { href: "/data-deletion", label: "العربية" }]
  }
};

/** A legal page (privacy policy, terms, data deletion): its text comes from the admin panel, or the built-in text until it is edited. */
export default async function LegalPageView({ slug, lang }: { slug: LegalSlug; lang: Lang }) {
  const en = lang === "en";
  const page = (await getLegalPage(slug))[lang];
  const path = `${en ? "/en" : ""}/${slug}`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": slug === "contact" ? "ContactPage" : "WebPage", "@id": `${SITE}${path}#webpage`, url: `${SITE}${path}`, name: page.title, inLanguage: en ? "en" : "ar-SA", isPartOf: { "@type": "WebSite", name: "Linkly", url: SITE } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: en ? "Home" : "الرئيسية", item: `${SITE}${en ? "/en" : "/"}` }, { "@type": "ListItem", position: 2, name: page.title }] }
    ]
  };
  return (
    <main className="legal-page" {...(en ? { dir: "ltr" as const, lang: "en" } : slug === "contact" ? { dir: "rtl" as const } : {})}>
      {en ? <HtmlLangSync lang="en" dir="ltr" /> : null}
      <JsonLd data={graph} />
      <section className="legal-shell">
        <Link className="legal-brand" href={en ? "/en" : "/"}>
          <span className="legal-logo" aria-hidden="true" />
          Linkly
        </Link>
        <h1>{page.title}</h1>
        {page.updated ? <p className="legal-updated">{page.updated}</p> : null}
        {parseLegalBody(page.body).map((block, index) => {
          switch (block.type) {
            case "h2": return <h2 key={index}>{block.text}</h2>;
            case "h3": return <h3 key={index}>{block.text}</h3>;
            case "p": return <p key={index}>{withLinks(block.text)}</p>;
            case "ul": return <ul key={index}>{block.items.map((item, at) => <li key={at}>{withLinks(item)}</li>)}</ul>;
            case "ol": return <ol key={index}>{block.items.map((item, at) => <li key={at}>{withLinks(item)}</li>)}</ol>;
            case "actions": return <ContactActions key={index} lang={lang} />;
            default: return <div className="legal-contact" key={index}>{block.paragraphs.map((paragraph, at) => <p key={at}>{withLinks(paragraph)}</p>)}</div>;
          }
        })}
        <nav className="legal-links">
          {NAV[slug][lang].map((item) => item === "cookies"
            ? <CookieSettingsLink key="cookies" label={en ? "Cookie settings" : "إعدادات الكوكيز"} />
            : <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
      </section>
    </main>
  );
}
