"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStoredLanguage } from "../useStoredLanguage";
import { isSellableBillingCycle, SELLABLE_BILLING_CYCLES } from "../../lib/billing-pricing";
import { cycleTabLabel } from "../../lib/billing-cycle-copy";
import { planDisplayName } from "../../lib/plan-features";

type Plan = { id: string; name: string };
type Subscription = { plan: string; billingCycle: string; status: string };

const copy = {
  ar: {
    heading: "تم تعليق الحساب",
    trialBody: "انتهت فترتك التجريبية ولم يتم الاشتراك بعد. اشترك الآن لإعادة فتح الحساب — تعود كل بياناتك وقنواتك كما هي فور الاشتراك.",
    body: "انتهى اشتراكك ولم يُسدَّد خلال المهلة. يُرجى تسديد الاشتراك لإعادة فتح الحساب — تعود كل بياناتك وقنواتك كما هي فور السداد.",
    plan: "الباقة",
    cycle: "دورة الدفع",
    pay: "متابعة إلى الدفع",
    review: "تقدر تراجع السعر النهائي قبل تأكيد الدفع.",
    unavailable: "لا توجد باقات متاحة للدفع حاليًا.",
    paying: "جاري التحويل...",
    logout: "تسجيل الخروج",
    error: "تعذر بدء عملية الدفع. حاول مرة أخرى."
  },
  en: {
    heading: "Account Suspended",
    trialBody: "Your trial has ended and you haven't subscribed yet. Subscribe now to reopen your account — all your data and channels return exactly as they were.",
    body: "Your subscription ended and wasn't paid within the grace period. Please pay to reopen your account — all your data and channels return exactly as they were.",
    plan: "Plan",
    cycle: "Billing cycle",
    pay: "Continue to payment",
    review: "You can review the final price before confirming payment.",
    unavailable: "No plans are currently available for checkout.",
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
  const [planId, setPlanId] = useState(() => plans.find((plan) => plan.name === subscription?.plan)?.id ?? plans[0]?.id ?? "");
  const [billingCycle, setBillingCycle] = useState(() => isSellableBillingCycle(subscription?.billingCycle) ? subscription.billingCycle : "شهري");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const text = copy[lang];
  const isTrial = subscription?.status === "تجربة";
  async function payNow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planId || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingCycle })
      });
      const payload = await response.json().catch(() => ({})) as { paymentId?: string; paymentUrl?: string; error?: string };
      if (!response.ok || (!payload.paymentId && !payload.paymentUrl)) {
        setError(payload.error || text.error);
      } else if (payload.paymentUrl) {
        location.href = payload.paymentUrl;
        return;
      } else {
        router.push(`/billing/pay/${payload.paymentId}`);
        return;
      }
    } catch {
      setError(text.error);
    }
    setLoading(false);
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
        {plans.length ? (
          <form className="suspended-checkout" onSubmit={payNow}>
            <div className="suspended-checkout-field">
              <label htmlFor="suspended-plan">{text.plan}</label>
              <select id="suspended-plan" value={planId} onChange={(event) => { setPlanId(event.target.value); setError(""); }} disabled={loading}>
                {plans.map((plan) => <option value={plan.id} key={plan.id}>{planDisplayName(plan.name, lang)}</option>)}
              </select>
            </div>
            <div className="suspended-checkout-field">
              <label htmlFor="suspended-cycle">{text.cycle}</label>
              <select id="suspended-cycle" value={billingCycle} onChange={(event) => {
                if (isSellableBillingCycle(event.target.value)) setBillingCycle(event.target.value);
                setError("");
              }} disabled={loading}>
                {SELLABLE_BILLING_CYCLES.map((cycle) => <option value={cycle} key={cycle}>{cycleTabLabel(cycle, lang)}</option>)}
              </select>
            </div>
            <p className="suspended-review">{text.review}</p>
            {error ? <p className="suspended-error" role="alert">{error}</p> : null}
            <button type="submit" className="suspended-pay-cta" disabled={loading || !planId}>
              {loading ? text.paying : text.pay}
            </button>
          </form>
        ) : <p>{text.unavailable}</p>}
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
