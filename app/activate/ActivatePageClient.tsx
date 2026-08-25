"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import ActivateForm from "./ActivateForm";

const copy = {
  ar: {
    ariaLabel: "تفعيل حساب Linkly",
    tagline: "إنشاء كلمة سر لحساب الموظف",
    heading: "تفعيل الحساب"
  },
  en: {
    ariaLabel: "Activate your Linkly account",
    tagline: "Create a password for your employee account",
    heading: "Activate account"
  }
} as const;

export default function ActivatePageClient() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const text = copy[lang];

  return (
    <main className="login-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="login-panel" aria-label={text.ariaLabel}>
        <div className="login-lang-toggle">
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>

        <div className="login-brand">
          <Image src="/assets/linkly-logo.png" alt="" width={44} height={44} />
          <div>
            <span>Linkly</span>
            <b>{text.tagline}</b>
          </div>
        </div>

        <div className="login-copy">
          <p>{text.heading}</p>
        </div>

        <Suspense fallback={null}>
          <ActivateForm lang={lang} />
        </Suspense>
      </section>
    </main>
  );
}
