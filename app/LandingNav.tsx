"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import logo from "../public/assets/linkly-logo.png";
import s from "./page.module.css";

const copy = {
  ar: {
    brandAria: "Linkly - الرئيسية",
    features: "المميزات",
    how: "طريقة العمل",
    pricing: "الأسعار",
    faq: "الأسئلة الشائعة",
    switchLabel: "English",
    switchHref: "/en",
    login: "تسجيل الدخول",
    signup: "ابدأ تجربتك مجانًا",
    menuOpen: "فتح القائمة",
    menuClose: "إغلاق القائمة",
    navAria: "التنقل الرئيسي",
    skip: "تخطَّ إلى المحتوى الرئيسي"
  },
  en: {
    brandAria: "Linkly - Home",
    features: "Features",
    how: "How it works",
    pricing: "Pricing",
    faq: "FAQ",
    switchLabel: "العربية",
    switchHref: "/",
    login: "Sign in",
    signup: "Start your free trial",
    menuOpen: "Open menu",
    menuClose: "Close menu",
    navAria: "Main navigation",
    skip: "Skip to main content"
  }
} as const;

export default function LandingNav({ lang = "ar", anchorBase = "", skipTo, onSwitchLanguage }: { lang?: "ar" | "en"; anchorBase?: string; skipTo?: string; onSwitchLanguage?: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const text = copy[lang];
  const homeHref = lang === "en" ? "/en" : "/";

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 981px)");
    const closeOnResize = () => { if (desktop.matches) setOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    desktop.addEventListener("change", closeOnResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnResize);
    };
  }, [open]);

  // Remember the landing page's language so login/signup and the rest of the
  // journey (via useStoredLanguage) pick it up instead of resetting to Arabic.
  // Only on the landing pages, whose language is fixed by the URL: a page that
  // switches language itself (signup, via onSwitchLanguage) stores it through
  // useStoredLanguage. Writing here too would run first (child effects before
  // the parent's) and overwrite the saved choice with the initial "ar".
  useEffect(() => {
    if (onSwitchLanguage) return;
    window.localStorage.setItem("audiencew-language", lang);
  }, [lang, onSwitchLanguage]);

  const close = () => setOpen(false);
  const closeAndReturnFocus = () => {
    close();
    menuRef.current?.focus();
  };
  const languageSwitch = onSwitchLanguage
    ? <button type="button" className={s.langSwitch} onClick={() => { close(); onSwitchLanguage(); }}>{text.switchLabel}</button>
    : <Link href={text.switchHref} onClick={close}>{text.switchLabel}</Link>;

  return (
    <header
      className={s.navbar}
      onBlur={(event) => { if (open && !event.currentTarget.contains(event.relatedTarget)) close(); }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          closeAndReturnFocus();
        }
      }}
    >
      {skipTo ? <a className={s.skipLink} href={`#${skipTo}`}>{text.skip}</a> : null}
      <div className={s.navInner}>
        <Link className={s.brand} href={homeHref} onClick={close} aria-label={text.brandAria}>
          <Image src={logo} alt="" width={56} height={31} priority />
          <span>Linkly</span>
        </Link>
        <button ref={menuRef} className={s.menu} type="button" aria-label={open ? text.menuClose : text.menuOpen} aria-expanded={open} aria-controls="landing-navigation" onClick={() => setOpen(value => !value)}>
          <i /><i /><i />
        </button>
        <nav id="landing-navigation" className={open ? s.navOpen : ""} aria-label={text.navAria}>
          <a href={`${anchorBase}#features`} onClick={close}>{text.features}</a>
          <a href={`${anchorBase}#how`} onClick={close}>{text.how}</a>
          <a href={`${anchorBase}#pricing`} onClick={close}>{text.pricing}</a>
          <a href={`${anchorBase}#faq`} onClick={close}>{text.faq}</a>
          <span className={s.mobileLang}>{languageSwitch}</span>
          <Link className={s.mobileLogin} href="/login" onClick={close}>{text.login}</Link>
          <Link className={s.mobileNavCta} href="/signup" onClick={close}>{text.signup}</Link>
        </nav>
        <div className={s.navActions}>
          <Link href="/login">{text.login}</Link>
          <Link className={s.primary} href="/signup">{text.signup}</Link>
          <span className={s.langCorner}>{languageSwitch}</span>
        </div>
      </div>
      {open ? <button className={s.navBackdrop} type="button" tabIndex={-1} aria-label={text.menuClose} onMouseDown={(event) => event.preventDefault()} onClick={closeAndReturnFocus} /> : null}
    </header>
  );
}
