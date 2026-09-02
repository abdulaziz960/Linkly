"use client";

import { useState } from "react";
import Image from "next/image";
import ForgotPasswordForm from "./ForgotPasswordForm";

const copy = {
  ar: {
    ariaLabel: "استعادة كلمة المرور",
    tagline: "منصة إدارة محادثات واتساب للأعمال",
    heading: "استعادة كلمة المرور"
  },
  en: {
    ariaLabel: "Reset your password",
    tagline: "WhatsApp business conversation platform",
    heading: "Reset your password"
  }
} as const;

export default function ForgotPasswordPageClient() {
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
          <Image src="/assets/linkly-logo.png" alt="" width={72} height={40} />
          <div>
            <span>Linkly</span>
            <b>{text.tagline}</b>
          </div>
        </div>

        <div className="login-copy">
          <p>{text.heading}</p>
        </div>

        <ForgotPasswordForm lang={lang} />
      </section>
    </main>
  );
}
