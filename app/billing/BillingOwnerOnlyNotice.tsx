"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStoredLanguage } from "../useStoredLanguage";

const copy = {
  ar: {
    stepLabel: "الاشتراك متوقف",
    heading: "انتهت الفترة التجريبية لحسابك",
    body: "إدارة الاشتراك وإكمال الدفع متاحة فقط لمالك الحساب. تواصل مع مالك الحساب في شركتك لتجديد الاشتراك حتى تتمكن من الوصول للوحة التحكم مرة أخرى.",
    logout: "تسجيل الخروج"
  },
  en: {
    stepLabel: "Subscription paused",
    heading: "Your account's trial period has ended",
    body: "Managing the subscription and completing payment is available to the account owner only. Contact your company's account owner to renew the subscription so you can access the dashboard again.",
    logout: "Sign out"
  }
} as const;

export default function BillingOwnerOnlyNotice({ branding }: { branding: { name: string; logoDataUrl: string } }) {
  const [lang, setLang] = useStoredLanguage("ar");
  const router = useRouter();
  const text = copy[lang];

  return (
    <main className="billing-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="billing-header">
        <span />
        <div className="billing-lang-toggle">
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <div><Image src={branding.logoDataUrl} alt="" width={64} height={35} unoptimized={branding.logoDataUrl.startsWith("data:")} /><b>{branding.name}</b></div>
      </header>
      <section className="billing-hero">
        <span>{text.stepLabel}</span>
        <h1>{text.heading}</h1>
        <div className="current-plan blocked">{text.body}</div>
        <button
          type="button"
          className="billing-owner-notice-logout"
          onClick={() => { fetch("/api/auth/logout", { method: "POST" }).finally(() => router.push("/login")); }}
        >
          {text.logout}
        </button>
      </section>
    </main>
  );
}
