"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

const CONSENT_STORAGE_KEY = "linkly-analytics-consent";
/** First-party cookie with the same value: survives localStorage clears and is re-issued by the server (/api/consent). */
const CONSENT_COOKIE_NAME = "linkly_consent";
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
/** Internal tools never show the banner and never load analytics. */
const NO_BANNER_PREFIXES = ["/linkly-admin007"];
/** Dispatched by CookieSettingsLink to reopen the banner after a first choice. */
export const REOPEN_COOKIE_BANNER_EVENT = "linkly:open-cookie-settings";
const GTM_ID = "GTM-TXWK77FV";
const GTAG_ID = "G-PRB5YHZPGY";

type Consent = "accepted" | "rejected" | null;

/** Cookie name patterns set by GTM/GA once loaded (_ga, _ga_<container-id>, _gid, _gat, _gcl_au, _gcl_aw). */
const ANALYTICS_COOKIE_PATTERNS = [/^_ga$/, /^_ga_/, /^_gid$/, /^_gat/, /^_gcl_/];

/**
 * Deletes any GA/GTM cookies already set from an earlier "accepted" session.
 * Rejecting only stops the scripts from loading again - it doesn't undo
 * cookies Google's script already wrote, so we clear those explicitly.
 */
function clearAnalyticsCookies() {
  if (typeof document === "undefined") return;
  const hostname = window.location.hostname;
  const domainParts = hostname.split(".");
  const domains = [undefined, hostname];
  if (domainParts.length > 1) {
    domains.push(`.${domainParts.slice(-2).join(".")}`);
  }
  document.cookie.split(";").forEach((entry) => {
    const name = entry.split("=")[0]?.trim();
    if (!name || !ANALYTICS_COOKIE_PATTERNS.some((pattern) => pattern.test(name))) return;
    domains.forEach((domain) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ""}`;
    });
  });
}

function readCookieConsent(): Consent {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${CONSENT_COOKIE_NAME}=`));
  const value = entry?.split("=")[1];
  return value === "accepted" || value === "rejected" ? value : null;
}

function readStoredConsent(): Consent {
  let local: Consent = null;
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === "accepted" || stored === "rejected") local = stored;
  } catch {
    // Storage blocked - the cookie below may still hold the choice.
  }
  return readCookieConsent() ?? local;
}

/** Writes the choice to every store (cookie, localStorage) so it is remembered even if one of them is cleared. */
function persistConsent(value: "accepted" | "rejected") {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // Best effort; the cookie still holds it.
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  // Re-issue the cookie from the server: browsers (Safari ITP) cap script-set
  // cookies at 7 days but keep server-set first-party cookies for their full life.
  void fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice: value }), keepalive: true }).catch(() => undefined);
}

const copy = {
  ar: {
    text: "نستخدم ملفات تعريف الارتباط (الكوكيز) لتحسين تجربتك على موقعنا وتحليل الاستخدام. بمتابعتك تصفح الموقع أو الضغط على \"قبول\"، أنت توافق على استخدامنا لها.",
    learnMore: "سياسة الخصوصية",
    reject: "رفض",
    accept: "قبول",
    settingsTitle: "إعدادات الكوكيز",
    essential: "الكوكيز الضرورية",
    essentialDescription: "لازمة لتشغيل الموقع وحفظ تفضيلاتك، ولا يمكن تعطيلها هنا.",
    analytics: "كوكيز التحليلات",
    analyticsDescription: "تساعدنا على فهم استخدام الموقع. لا تُحمّل أدوات التحليل إلا بعد موافقتك.",
    currentChoice: "اختيارك الحالي",
    undecided: "لم تحدد بعد",
    accepted: "مفعّلة",
    rejected: "معطّلة",
    close: "إغلاق"
  },
  en: {
    text: "We use cookies to improve your experience on our site and analyze usage. By continuing to browse or clicking \"Accept\", you agree to our use of cookies.",
    learnMore: "Privacy Policy",
    reject: "Reject",
    accept: "Accept",
    settingsTitle: "Cookie settings",
    essential: "Essential cookies",
    essentialDescription: "Needed to run the site and remember your preferences. They cannot be disabled here.",
    analytics: "Analytics cookies",
    analyticsDescription: "Help us understand site usage. Analytics tools load only after you opt in.",
    currentChoice: "Current choice",
    undecided: "Not set yet",
    accepted: "Enabled",
    rejected: "Disabled",
    close: "Close"
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
  // The stored choice is only known on the client. Until it has been read, no
  // banner is rendered, so returning visitors never see it flash on page load.
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored = readStoredConsent();
    if (stored) {
      setConsent(stored);
      setDecided(true);
      if (stored === "rejected") clearAnalyticsCookies();
      // Self-heal: if only one store still has the choice, copy it to the other.
      persistConsent(stored);
    }
    setReady(true);

    const reopen = () => setSettingsOpen(true);
    window.addEventListener(REOPEN_COOKIE_BANNER_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_COOKIE_BANNER_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    closeButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [settingsOpen]);

  function choose(value: "accepted" | "rejected") {
    const shouldReload = consent === "accepted" && value === "rejected";
    setConsent(value);
    setDecided(true);
    setSettingsOpen(false);
    if (value === "rejected") clearAnalyticsCookies();
    persistConsent(value);
    // Removing a Script element cannot unload a previously loaded analytics
    // runtime. Reload with the rejected preference to stop future tracking.
    if (shouldReload) window.location.reload();
  }

  // Internal tools (admin panel): no banner, no analytics.
  if (NO_BANNER_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return null;

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
      {ready && !decided && !settingsOpen ? (
        <div
          role="dialog"
          aria-label={lang === "ar" ? "إشعار الكوكيز" : "Cookie notice"}
          dir={lang === "ar" ? "rtl" : "ltr"}
          style={{
            position: "fixed",
            insetInline: 16,
            top: pathname?.includes("/privacy") ? 16 : undefined,
            bottom: pathname?.includes("/privacy") ? undefined : 16,
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
              onClick={() => setSettingsOpen(true)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "inherit", fontWeight: 700, cursor: "pointer" }}
            >
              {text.settingsTitle}
            </button>
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
      {settingsOpen ? (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", padding: 16, background: "rgba(7, 31, 30, .62)" }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={text.settingsTitle}
            dir={lang === "ar" ? "rtl" : "ltr"}
            style={{ width: "min(100%, 480px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", padding: 24, borderRadius: 18, background: "#fff", color: "#153f3c", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>{text.settingsTitle}</h2>
              <button ref={closeButtonRef} type="button" aria-label={text.close} onClick={() => setSettingsOpen(false)} style={{ width: 44, height: 44, border: "1px solid #b8d3d0", borderRadius: 10, background: "#f4faf9", color: "#153f3c", fontSize: 24, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ marginTop: 18, padding: 14, border: "1px solid #d5e7e4", borderRadius: 12 }}>
              <strong>{text.essential}</strong>
              <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>{text.essentialDescription}</p>
            </div>
            <div style={{ marginTop: 10, padding: 14, border: "1px solid #d5e7e4", borderRadius: 12 }}>
              <strong>{text.analytics}</strong>
              <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>{text.analyticsDescription}</p>
              <p style={{ margin: "10px 0 0", fontWeight: 700 }}>{text.currentChoice}: {consent === "accepted" ? text.accepted : consent === "rejected" ? text.rejected : text.undecided}</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => choose("rejected")} style={{ flex: "1 1 150px", minHeight: 44, border: "1px solid #178a82", borderRadius: 10, background: "#fff", color: "#106b65", fontWeight: 800, cursor: "pointer" }}>{text.reject}</button>
              <button type="button" onClick={() => choose("accepted")} style={{ flex: "1 1 150px", minHeight: 44, border: 0, borderRadius: 10, background: "#178a82", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{text.accept}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
