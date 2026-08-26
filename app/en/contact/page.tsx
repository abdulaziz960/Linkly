import type { Metadata } from "next";
import Link from "next/link";
import "../../legal.css";

export const metadata: Metadata = {
  title: { absolute: "Contact us | Linkly" },
  description: "Contact the Linkly team for sales, support, and help setting up your customer service channels.",
  alternates: { canonical: "/en/contact", languages: { "ar-SA": "/contact", en: "/en/contact" } }
};

export default function ContactPageEn() {
  return (
    <main className="legal-page" dir="ltr" lang="en">
      <section className="legal-shell">
        <Link className="legal-brand" href="/en">
          <span className="legal-logo">A</span>
          Linkly
        </Link>
        <h1>We'll help you set up your workspace and channels</h1>
        <p>For sales or technical support, reach out to the Linkly team — we'll reply during business hours.</p>

        <h2>Email</h2>
        <p><a href="mailto:hello@audience.sa">hello@audience.sa</a></p>

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
