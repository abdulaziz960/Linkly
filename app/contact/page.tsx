import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "تواصل مع فريق AudienceW للمبيعات والدعم وتجهيز قنوات خدمة العملاء.",
  alternates: { canonical: "/contact" }
};

export default function ContactPage() {
  return (
    <main className="legal-page" dir="rtl">
      <article className="legal-card">
        <Link href="/" className="legal-back">العودة إلى AudienceW</Link>
        <p className="legal-kicker">تواصل معنا</p>
        <h1>نساعدك في تجهيز مساحة عملك وقنواتك</h1>
        <p>للمبيعات أو الدعم الفني راسل فريق AudienceW، وسنرد عليك خلال ساعات العمل.</p>
        <h2>البريد الإلكتروني</h2>
        <p><a href="mailto:hello@audience.sa">hello@audience.sa</a></p>
        <h2>ساعات العمل</h2>
        <p>الأحد إلى الخميس، من 9 صباحًا إلى 6 مساءً بتوقيت الرياض.</p>
      </article>
    </main>
  );
}
