"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SignupForm from "./SignupForm";

const copy = {
  ar: {
    kicker: "تجربة مجانية لمدة 14 يومًا",
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
    haveAccount: "لديك حساب؟",
    login: "تسجيل الدخول"
  },
  en: {
    kicker: "14-day free trial",
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
    haveAccount: "Already have an account?",
    login: "Sign in"
  }
} as const;

export default function SignupPageClient() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const text = copy[lang];

  return (
    <main className="journey-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="journey-copy">
        <div className="journey-lang-toggle">
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <Link className="journey-brand" href="/"><Image src="/assets/audiencew-logo.png" alt="" width={44} height={44} />AudienceW</Link>
        <span className="journey-kicker">{text.kicker}</span>
        <h1>{text.heroTitle}</h1>
        <p>{text.heroCopy}</p>
        <ol className="journey-steps">
          {text.steps.map(([title, description], index) => (
            <li key={title}><b>{index + 1}</b><span><strong>{title}</strong>{description}</span></li>
          ))}
        </ol>
      </section>
      <section className="journey-card">
        <div><span>{text.stepLabel}</span><h2>{text.cardTitle}</h2><p>{text.cardCopy}</p></div>
        <SignupForm lang={lang} />
        <small>{text.haveAccount} <Link href="/login">{text.login}</Link></small>
      </section>
    </main>
  );
}
