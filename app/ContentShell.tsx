import Link from "next/link";
import type { ReactNode } from "react";
import HtmlLangSync from "./HtmlLangSync";
import "./legal.css";

export default function ContentShell({ lang, children }: { lang: "ar" | "en"; children: ReactNode }) {
  const en = lang === "en";
  return (
    <main className="legal-page" dir={en ? "ltr" : "rtl"} lang={lang}>
      {en ? <HtmlLangSync lang="en" dir="ltr" /> : null}
      <section className="legal-shell">
        <Link className="legal-brand" href={en ? "/en" : "/"}>
          <span className="legal-logo" aria-hidden="true" />
          Linkly
        </Link>
        {children}
        <nav className="legal-links">
          <Link href={en ? "/en" : "/"}>{en ? "Home" : "الصفحة الرئيسية"}</Link>
          <Link href={en ? "/en/faq" : "/faq"}>{en ? "FAQ" : "الأسئلة الشائعة"}</Link>
          <Link href={en ? "/en/blog" : "/blog"}>{en ? "Blog" : "المدونة"}</Link>
          <Link href={en ? "/en/contact" : "/contact"}>{en ? "Contact" : "تواصل معنا"}</Link>
        </nav>
      </section>
    </main>
  );
}
