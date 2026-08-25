"use client";
import { useState } from "react";
import Link from "next/link";
import "../billing.css";

const copy = {
  ar: {
    heading: "تم تفعيل الاشتراك",
    body: "اكتملت رحلة الشراء بنجاح وأصبحت الباقة نشطة على حسابك.",
    backToDashboard: "العودة إلى لوحة العميل",
    viewSubscription: "عرض تفاصيل الاشتراك"
  },
  en: {
    heading: "Subscription activated",
    body: "Your purchase completed successfully and the plan is now active on your account.",
    backToDashboard: "Back to dashboard",
    viewSubscription: "View subscription details"
  }
} as const;

export default function BillingSuccess() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const text = copy[lang];

  return (
    <main className="test-checkout" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section>
        <div className="billing-lang-toggle" style={{ justifyContent: "center", marginBottom: 12 }}>
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <b className="success-payment">✓</b>
        <h1>{text.heading}</h1>
        <p>{text.body}</p>
        <div className="test-actions">
          <Link className="primary-link" href="/dashboard">{text.backToDashboard}</Link>
          <Link href="/billing">{text.viewSubscription}</Link>
        </div>
      </section>
    </main>
  );
}
