"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import BillingClient from "./BillingClient";

type Plan = { id: string; name: string; monthlyPrice: number; employeeLimit: number };
type Subscription = { plan: string; status: string } | null;

const copy = {
  ar: {
    backToDashboard: "→ العودة للوحة العميل",
    stepLabel: "الخطوة 3 من 3",
    heading: "اختر الباقة المناسبة لفريقك",
    subheading: "اشتراك شهري مرن، ويمكنك تغيير الباقة لاحقًا.",
    currentPlan: "اشتراكك الحالي:",
    blockedSuspended: "تم إيقاف حسابك من فريق Linkly. اختر باقة وأكمل الدفع لإعادة تفعيله، أو تواصل معنا إذا كان هذا خطأ.",
    blockedTrialEnded: "انتهت فترتك التجريبية. اختر باقة وأكمل الدفع لمتابعة استخدام حسابك."
  },
  en: {
    backToDashboard: "→ Back to dashboard",
    stepLabel: "Step 3 of 3",
    heading: "Choose the right plan for your team",
    subheading: "A flexible monthly subscription — you can change your plan later.",
    currentPlan: "Your current subscription:",
    blockedSuspended: "Your account has been suspended by the Linkly team. Choose a plan and complete payment to reactivate it, or contact us if this is a mistake.",
    blockedTrialEnded: "Your trial period has ended. Choose a plan and complete payment to keep using your account."
  }
} as const;

function subscriptionStatusLabel(status: string, lang: "ar" | "en") {
  if (lang === "ar") return status;
  if (status === "نشط") return "Active";
  if (status === "تجربة") return "Trial";
  if (status === "متوقف") return "Suspended";
  return status;
}

export default function BillingPageClient({
  plans,
  subscription,
  expired
}: {
  plans: Plan[];
  subscription: Subscription;
  expired: boolean;
}) {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const text = copy[lang];
  const blockedReason = expired
    ? subscription?.status === "متوقف"
      ? text.blockedSuspended
      : text.blockedTrialEnded
    : "";

  return (
    <main className="billing-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="billing-header">
        <Link href="/dashboard">{text.backToDashboard}</Link>
        <div className="billing-lang-toggle">
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <div><Image src="/assets/linkly-logo.png" alt="" width={44} height={44} /><b>Linkly</b></div>
      </header>
      <section className="billing-hero">
        <span>{text.stepLabel}</span>
        <h1>{text.heading}</h1>
        <p>{text.subheading}</p>
        {blockedReason ? <div className="current-plan blocked">{blockedReason}</div> : null}
        {subscription ? (
          <div className="current-plan">
            {text.currentPlan} <b>{subscription.plan}</b><em>{subscriptionStatusLabel(subscription.status, lang)}</em>
          </div>
        ) : null}
      </section>
      <BillingClient plans={plans} currentPlan={subscription?.plan || ""} lang={lang} />
    </main>
  );
}
