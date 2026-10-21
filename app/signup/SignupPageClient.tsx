"use client";

import type { BillingCycle } from "../../lib/billing-pricing";
import Link from "next/link";
import SignupForm from "./SignupForm";
import LandingNav from "../LandingNav";
import SiteFooter from "../SiteFooter";
import shell from "../page.module.css";
import { useStoredLanguage } from "../useStoredLanguage";
import { REOPEN_COOKIE_BANNER_EVENT } from "../CookieConsent";

const copy = {
  ar: {
    kicker: "تجربة مجانية لمدة 3 أيام",
    heroTitle: "ابدأ من أول محادثة، وشاهد فريقك يعمل من مكان واحد.",
    heroCopy: "أنشئ مساحة عملك، اربط قنواتك، وجرّب الصندوق الموحد قبل اختيار الباقة المناسبة.",
    steps: [
      ["أنشئ حسابك", "بيانات بسيطة بدون بطاقة بنكية"],
      ["فعّل مساحة العمل", "اختر كلمة السر واربط قنواتك"],
      ["جرّب ثم اشترك", "اختر الباقة من داخل لوحة العميل"]
    ],
    stepLabel: "الخطوة 1 من 3",
    cardTitle: "أنشئ مساحة العمل",
    cardCopy: "لن يتم خصم أي مبلغ أثناء التجربة.",
    selectedPlan: "الباقة التي اخترتها",
    billingMonthly: "دفع شهري بعد التجربة",
    billingYearly: "دفع سنوي بعد التجربة",
    billingQuarterly: "دفع ربع سنوي بعد التجربة",
    billingSemiannual: "دفع نصف سنوي بعد التجربة",
    planNote: "ستجرّب هذه الباقة بمزاياها فقط خلال الفترة التجريبية، ويمكنك تجربة باقة أخرى من داخل لوحة التحكم. لا تُفعّل الباقة المدفوعة إلا بعد إتمام الدفع.",
    haveAccount: "لديك حساب؟",
    login: "تسجيل الدخول",
    cookieSettings: "إعدادات الكوكيز",
    trustLabel: "لماذا لنكلي",
    trust: ["بدون بطاقة بنكية", "إلغاء التجربة في أي وقت", "بياناتك محمية ومشفّرة"]
  },
  en: {
    kicker: "3-day free trial",
    heroTitle: "Start from the first conversation, and watch your team work from one place.",
    heroCopy: "Create your workspace, connect your channels, and try the unified inbox before choosing the right plan.",
    steps: [
      ["Create your account", "Simple details, no card required"],
      ["Activate your workspace", "Set a password and connect your channels"],
      ["Try it, then subscribe", "Choose your plan from inside the customer dashboard"]
    ],
    stepLabel: "Step 1 of 3",
    cardTitle: "Create your workspace",
    cardCopy: "You won't be charged anything during the trial.",
    selectedPlan: "Your selected plan",
    billingMonthly: "Monthly billing after the trial",
    billingYearly: "Yearly billing after the trial",
    billingQuarterly: "Quarterly billing after the trial",
    billingSemiannual: "Semi-annual billing after the trial",
    planNote: "You'll try this plan with its own features during the trial, and can try another plan from inside the dashboard. A paid plan only activates after payment.",
    haveAccount: "Already have an account?",
    login: "Sign in",
    cookieSettings: "Cookie settings",
    trustLabel: "Why Linkly",
    trust: ["No credit card needed", "Cancel the trial any time", "Your data is protected and encrypted"]
  }
} as const;

export default function SignupPageClient({ selectedPlan, selectedBilling, plans, defaultPlanId }: { selectedPlan: { id: string; name: string } | null; selectedBilling: BillingCycle; plans: { id: string; name: string }[]; defaultPlanId: string }) {
  const [lang, setLang] = useStoredLanguage("ar");
  const text = copy[lang];

  return (
    <div className={shell.page} dir={lang === "ar" ? "rtl" : "ltr"}>
      <LandingNav lang={lang} anchorBase="/" onSwitchLanguage={() => setLang(lang === "ar" ? "en" : "ar")} />
      <div className="journey-shell"><main className="journey-page">
        <section className="journey-copy">
          <span className="journey-kicker">{text.kicker}</span>
          <h1>{text.heroTitle}</h1>
          <p>{text.heroCopy}</p>
          <ol className="journey-steps">
            {text.steps.map(([title, description], index) => (
              <li key={title}><b>{index + 1}</b><span><strong>{title}</strong>{description}</span></li>
            ))}
          </ol>
          <ul className="journey-trust" aria-label={text.trustLabel}>
            {text.trust.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="journey-card">
          <div className="journey-card-head"><span>{text.stepLabel}</span><h2>{text.cardTitle}</h2><p>{text.cardCopy}</p></div>
          {selectedPlan ? <div className="signup-selected-plan" data-testid="signup-selected-plan">
            <span>{text.selectedPlan}</span>
            <strong>{selectedPlan.name}</strong>
            <small>{{ "شهري": text.billingMonthly, "ربع سنوي": text.billingQuarterly, "نصف سنوي": text.billingSemiannual, "سنوي": text.billingYearly }[selectedBilling]}</small>
            <p>{text.planNote}</p>
          </div> : null}
          <SignupForm lang={lang} plans={plans} defaultPlanId={defaultPlanId} />
          <small>{text.haveAccount} <Link href="/login">{text.login}</Link></small>
          <small><button type="button" className="signup-cookie-settings" onClick={() => window.dispatchEvent(new Event(REOPEN_COOKIE_BANNER_EVENT))}>{text.cookieSettings}</button></small>
        </section>
      </main></div>
      <SiteFooter lang={lang} />
    </div>
  );
}
