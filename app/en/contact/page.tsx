import type { Metadata } from "next";
import { applyPageSeo } from "../../../lib/page-seo";
import Link from "next/link";
import HtmlLangSync from "../../HtmlLangSync";
import "../../legal.css";

const baseMetadata: Metadata = {
  title: { absolute: "Contact us | Linkly" },
  description: "Contact the Linkly team for sales, support, and help setting up your customer service channels.",
  alternates: { canonical: "/en/contact", languages: { "ar-SA": "/contact", en: "/en/contact" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/contact", baseMetadata);
}

export default function ContactPageEn() {
  return (
    <main className="legal-page" dir="ltr" lang="en">
      <HtmlLangSync lang="en" dir="ltr" />
      <section className="legal-shell">
        <Link className="legal-brand" href="/en">
          <span className="legal-logo" aria-hidden="true" />
          Linkly
        </Link>
        <h1>We'll help you set up your workspace and channels</h1>
        <p>For sales or technical support, reach out to the Linkly team — we'll reply during business hours.</p>

        <h2>Email</h2>
        <p><a href="mailto:info@linklysa.io">info@linklysa.io</a></p>

        <h2>Business hours</h2>
        <p>Sunday to Thursday, 9 AM to 6 PM Riyadh time.</p>

        <nav className="legal-links">
          <Link href="/en">Home</Link>
          <Link href="/contact">العربية</Link>
        </nav>
      </section>
    </main>
  );
}
