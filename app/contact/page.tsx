import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "تواصل مع فريق AudienceW للمبيعات والدعم وتجهيز قنوات خدمة العملاء.",
  alternates: { canonical: "/contact", languages: { "ar-SA": "/contact", en: "/en/contact" } }
};

export default function ContactPage() {
  return (
    <main className="legal-page" dir="rtl">
      <section className="legal-shell">
        <Link className="legal-brand" href="/">
          <span className="legal-logo">A</span>
          AudienceW
        </Link>
        <h1>نساعدك في تجهيز مساحة عملك وقنواتك</h1>
        <p>للمبيعات أو الدعم الفني راسل فريق AudienceW، وسنرد عليك خلال ساعات العمل.</p>

        <h2>البريد الإلكتروني</h2>
        <p><a href="mailto:hello@audience.sa">hello@audience.sa</a></p>

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
