"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

const CONSENT_STORAGE_KEY = "linkly-analytics-consent";
/** Dispatched by CookieSettingsLink to reopen the banner after a first choice. */
export const REOPEN_COOKIE_BANNER_EVENT = "linkly:open-cookie-settings";
const GTM_ID = "GTM-5K5C9WRZ";
const GTAG_ID = "G-PRB5YHZPGY";

type Consent = "accepted" | "rejected" | null;

const copy = {
  ar: {
    text: "نستخدم ملفات تعريف الارتباط (الكوكيز) لتحسين تجربتك على موقعنا وتحليل الاستخدام. بمتابعتك تصفح الموقع أو الضغط على \"قبول\"، أنت توافق على استخدامنا لها.",
    learnMore: "سياسة الخصوصية",
    reject: "رفض",
    accept: "قبول"
  },
  en: {
    text: "We use cookies to improve your experience on our site and analyze usage. By continuing to browse or clicking \"Accept\", you agree to our use of cookies.",
    learnMore: "Privacy Policy",
    reject: "Reject",
    accept: "Accept"
  }
} as const;

/**
 * Google Tag Manager/gtag used to fire unconditionally on every page load
 * (including for anonymous visitors on the marketing site) with no consent
 * mechanism at all - a PDPL gap flagged in the pre-launch compliance audit.
 * Nothing analytics-related loads until the visitor explicitly accepts here;
 * the choice is remembered in localStorage so the banner only shows once.
 */
export default function CookieConsent() {
  const pathname = usePathname();
  const lang = pathname?.startsWith("/en") ? "en" : "ar";
  const text = copy[lang];
  const [consent, setConsent] = useState<Consent>(null);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored === "accepted" || stored === "rejected") {
        setConsent(stored);
        setDecided(true);
      }
    } catch {
      // Private mode/blocked storage - fall through to showing the banner
      // every visit rather than tracking without ever asking.
    }

    const reopen = () => setDecided(false);
    window.addEventListener(REOPEN_COOKIE_BANNER_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_COOKIE_BANNER_EVENT, reopen);
  }, []);

  function choose(value: "accepted" | "rejected") {
    setConsent(value);
    setDecided(true);
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    } catch {
      // Best-effort persistence only - the in-memory choice still applies
      // for the rest of this page view either way.
    }
  }

  return (
    <>
      {consent === "accepted" ? (
        <>
          <Script id="google-tag-manager" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
          <Script id="google-tag" src={`https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`} strategy="afterInteractive" />
          <Script id="google-tag-config" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GTAG_ID}');`}
          </Script>
        </>
      ) : null}
      {!decided ? (
        <div
          role="dialog"
          aria-label={lang === "ar" ? "إشعار الكوكيز" : "Cookie notice"}
          dir={lang === "ar" ? "rtl" : "ltr"}
          style={{
            position: "fixed",
            insetInline: 16,
            bottom: 16,
            zIndex: 9999,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 14,
            maxWidth: 640,
            margin: "0 auto",
            padding: "16px 18px",
            borderRadius: 16,
            background: "#0f403d",
            color: "#eefbf9",
            boxShadow: "0 12px 32px rgba(6, 39, 36, 0.35)",
            fontSize: 14,
            lineHeight: 1.6
          }}
        >
          <p style={{ margin: 0, flex: "1 1 260px" }}>
            {text.text}{" "}
            <Link href={lang === "en" ? "/en/privacy" : "/privacy"} style={{ color: "inherit", textDecoration: "underline", fontWeight: 700 }}>
              {text.learnMore}
            </Link>
          </p>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => choose("rejected")}
              style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "inherit", fontWeight: 700, cursor: "pointer" }}
            >
              {text.reject}
            </button>
            <button
              type="button"
              onClick={() => choose("accepted")}
              style={{ padding: "8px 16px", borderRadius: 10, border: 0, background: "#178a82", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >
              {text.accept}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
