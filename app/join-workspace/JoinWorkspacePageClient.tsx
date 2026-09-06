"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import JoinWorkspaceForm from "./JoinWorkspaceForm";

const copy = {
  ar: {
    ariaLabel: "الانضمام إلى شركة جديدة على Linkly",
    tagline: "تأكيد الانضمام بنفس حسابك الحالي",
    heading: "دعوة للانضمام"
  },
  en: {
    ariaLabel: "Join a new company on Linkly",
    tagline: "Confirm joining with your existing account",
    heading: "Workspace invitation"
  }
} as const;

export default function JoinWorkspacePageClient() {
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

        <Suspense fallback={null}>
          <JoinWorkspaceForm lang={lang} />
        </Suspense>
      </section>
    </main>
  );
}
