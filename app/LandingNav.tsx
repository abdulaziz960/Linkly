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
    navAria: "التنقل الرئيسي"
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
    navAria: "Main navigation"
  }
} as const;

export default function LandingNav({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const text = copy[lang];
  const homeHref = lang === "en" ? "/en" : "/";

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // Remember the landing page's language so login/signup and the rest of the
  // journey (via useStoredLanguage) pick it up instead of resetting to Arabic.
  useEffect(() => {
    window.localStorage.setItem("audiencew-language", lang);
  }, [lang]);

  const close = () => setOpen(false);

  return (
    <header className={s.navbar}>
      <div className={s.navInner}>
        <Link className={s.brand} href={homeHref} onClick={close} aria-label={text.brandAria}>
          <Image src={logo} alt="" width={56} height={31} priority />
          <span>Linkly</span>
        </Link>
        <button className={s.menu} type="button" aria-label={open ? text.menuClose : text.menuOpen} aria-expanded={open} aria-controls="landing-navigation" onClick={() => setOpen(value => !value)}>
          <i /><i /><i />
        </button>
        <nav id="landing-navigation" ref={panelRef} className={open ? s.navOpen : ""} aria-label={text.navAria}>
          <a href="#features" onClick={close}>{text.features}</a>
          <a href="#how" onClick={close}>{text.how}</a>
          <a href="#pricing" onClick={close}>{text.pricing}</a>
          <a href="#faq" onClick={close}>{text.faq}</a>
          <Link href={text.switchHref} onClick={close}>{text.switchLabel}</Link>
          <Link className={s.mobileLogin} href="/login" onClick={close}>{text.login}</Link>
          <Link className={s.mobileNavCta} href="/signup" onClick={close}>{text.signup}</Link>
        </nav>
        <div className={s.navActions}>
          <Link href="/login">{text.login}</Link>
          <Link className={s.primary} href="/signup">{text.signup}</Link>
        </div>
      </div>
      {open ? <button className={s.navBackdrop} type="button" aria-label={text.menuClose} onClick={close} /> : null}
    </header>
  );
}
