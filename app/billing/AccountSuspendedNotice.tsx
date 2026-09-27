"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStoredLanguage } from "../useStoredLanguage";

type Plan = { id: string; name: string };
type Subscription = { plan: string; amount: number; billingCycle: string; status: string };

const copy = {
  ar: {
    heading: "تم تعليق الحساب",
    trialBody: "انتهت فترتك التجريبية ولم يتم الاشتراك بعد. اشترك الآن لإعادة فتح الحساب — تعود كل بياناتك وقنواتك كما هي فور الاشتراك.",
    body: "انتهى اشتراكك ولم يُسدَّد خلال المهلة. يُرجى تسديد الاشتراك لإعادة فتح الحساب — تعود كل بياناتك وقنواتك كما هي فور السداد.",
    due: "المستحقّ",
    pay: "سداد المستحقّ لإعادة الفتح",
    paying: "جاري التحويل...",
    logout: "تسجيل الخروج",
    error: "تعذر بدء عملية الدفع. حاول مرة أخرى."
  },
  en: {
    heading: "Account Suspended",
    trialBody: "Your trial has ended and you haven't subscribed yet. Subscribe now to reopen your account — all your data and channels return exactly as they were.",
    body: "Your subscription ended and wasn't paid within the grace period. Please pay to reopen your account — all your data and channels return exactly as they were.",
    due: "Amount due",
    pay: "Pay to reopen",
    paying: "Redirecting...",
    logout: "Sign out",
    error: "Couldn't start the payment. Please try again."
  }
} as const;

export default function AccountSuspendedNotice({
  branding,
  subscription,
  plans
}: {
  branding: { name: string; logoDataUrl: string };
  subscription: Subscription | null;
  plans: Plan[];
}) {
  const [lang, setLang] = useStoredLanguage("ar");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const text = copy[lang];
  const isTrial = subscription?.status === "تجربة";
  const plan = plans.find((p) => p.name === subscription?.plan);

  async function payNow() {
    if (!plan) {
      setError(text.error);
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id, billingCycle: subscription?.billingCycle || "شهري" })
    });
    const payload = await response.json().catch(() => ({})) as { paymentId?: string; error?: string };
    if (!response.ok || !payload.paymentId) {
      setLoading(false);
      setError(payload.error || text.error);
      return;
    }
    router.push(`/billing/pay/${payload.paymentId}`);
  }

  return (
    <main className="billing-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="billing-header">
        <span />
        <div className="billing-lang-toggle">
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <span />
      </header>
      <section className="suspended-card">
        <Image src={branding.logoDataUrl} alt="" width={64} height={35} unoptimized={branding.logoDataUrl.startsWith("data:")} />
        <div className="suspended-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h1>{text.heading}</h1>
        <p>{isTrial ? text.trialBody : text.body}</p>
        {subscription && subscription.amount > 0 ? (
          <div className="suspended-due">{text.due}: <b>{subscription.amount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ر.س" : "SAR"}</b></div>
        ) : null}
        {error ? <p className="suspended-error" role="alert">{error}</p> : null}
        <button type="button" className="suspended-pay-cta" onClick={payNow} disabled={loading}>
          {loading ? text.paying : text.pay}
        </button>
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
