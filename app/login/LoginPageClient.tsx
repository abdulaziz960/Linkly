"use client";

import { useState } from "react";
import LoginForm from "./LoginForm";

const copy = {
  ar: {
    tagline: "منصة إدارة محادثات واتساب للأعمال",
    welcome: "مرحباً بعودتك"
  },
  en: {
    tagline: "WhatsApp business conversation platform",
    welcome: "Welcome back"
  }
};

export default function LoginPageClient() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const text = copy[lang];

  return (
    <main className="login-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="login-panel" aria-label={lang === "ar" ? "تسجيل الدخول إلى AudienceW" : "Sign in to AudienceW"}>
        <div className="login-lang-toggle">
          <button type="button" className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>

        <div className="login-brand">
          <img src="/assets/audiencew-logo.png" alt="" />
          <div>
            <span>AudienceW</span>
            <b>{text.tagline}</b>
          </div>
        </div>

        <div className="login-copy">
          <p>{text.welcome}</p>
        </div>

        <LoginForm lang={lang} />
      </section>
    </main>
  );
}
