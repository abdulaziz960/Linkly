import type { Metadata } from "next";
import { applyPageSeo } from "../../lib/page-seo";
import Link from "next/link";
import "../legal.css";

const baseMetadata: Metadata = {
  title: "تواصل معنا",
  description: "تواصل مع فريق Linkly للمبيعات والدعم وتجهيز قنوات خدمة العملاء.",
  alternates: { canonical: "/contact", languages: { "ar-SA": "/contact", en: "/en/contact" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/contact", baseMetadata);
}

export default function ContactPage() {
  return (
    <main className="legal-page" dir="rtl">
      <section className="legal-shell">
        <Link className="legal-brand" href="/">
          <span className="legal-logo" aria-hidden="true" />
          Linkly
        </Link>
        <h1>نساعدك في تجهيز مساحة عملك وقنواتك</h1>
        <p>للمبيعات أو الدعم الفني راسل فريق Linkly، وسنرد عليك خلال ساعات العمل.</p>

        <h2>البريد الإلكتروني</h2>
        <p><a href="mailto:info@linklysa.io">info@linklysa.io</a></p>

        <h2>ساعات العمل</h2>
        <p>الأحد إلى الخميس، من 9 صباحًا إلى 6 مساءً بتوقيت الرياض.</p>

        <nav className="legal-links">
          <Link href="/">الصفحة الرئيسية</Link>
          <Link href="/en/contact">English</Link>
        </nav>
      </section>
    </main>
  );
}
