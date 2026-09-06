import type { Metadata } from "next";
import Link from "next/link";
import "./legal.css";

export const metadata: Metadata = {
  title: { absolute: "الصفحة غير موجودة | Linkly" },
  robots: { index: false, follow: true }
};

export default function NotFound() {
  return (
    <main className="legal-page">
      <section className="legal-shell">
        <Link className="legal-brand" href="/">
          <span className="legal-logo" aria-hidden="true" />
          Linkly
        </Link>
        <h1>الصفحة غير موجودة</h1>
        <p>الرابط الذي فتحته غير صحيح أو تم نقل المحتوى. جرّب أحد الروابط التالية:</p>

        <nav className="legal-links">
          <Link href="/">الصفحة الرئيسية</Link>
          <Link href="/contact">تواصل معنا</Link>
          <Link href="/login">تسجيل الدخول</Link>
          <Link href="/en">English</Link>
        </nav>
      </section>
    </main>
  );
}
