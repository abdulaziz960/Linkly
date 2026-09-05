"use client";

import Image from "next/image";
import LoginForm from "./LoginForm";
import { useStoredLanguage } from "../useStoredLanguage";

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
  const [lang, setLang] = useStoredLanguage("ar");
  const text = copy[lang];

  return (
    <main className="login-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="login-panel" aria-label={lang === "ar" ? "تسجيل الدخول إلى Linkly" : "Sign in to Linkly"}>
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
          <h1>{text.welcome}</h1>
        </div>

        <LoginForm lang={lang} />
      </section>
    </main>
  );
}
