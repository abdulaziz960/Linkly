"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import logo from "../public/assets/audiencew-logo.png";
import s from "./page.module.css";

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={s.navbar}>
      <div className={s.navInner}>
        <Link className={s.brand} href="/" onClick={close} aria-label="AudienceW - الرئيسية">
          <Image src={logo} alt="" width={38} height={38} priority />
          <span>AudienceW</span>
        </Link>
        <button className={s.menu} type="button" aria-label={open ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={open} aria-controls="landing-navigation" onClick={() => setOpen(value => !value)}>
          <i /><i /><i />
        </button>
        <nav id="landing-navigation" ref={panelRef} className={open ? s.navOpen : ""} aria-label="التنقل الرئيسي">
          <a href="#features" onClick={close}>المميزات</a>
          <a href="#how" onClick={close}>طريقة العمل</a>
          <a href="#pricing" onClick={close}>الأسعار</a>
          <a href="#faq" onClick={close}>الأسئلة الشائعة</a>
          <Link className={s.mobileLogin} href="/login" onClick={close}>تسجيل الدخول</Link>
          <Link className={s.mobileNavCta} href="/signup" onClick={close}>ابدأ تجربتك مجانًا</Link>
        </nav>
        <div className={s.navActions}>
          <Link href="/login">تسجيل الدخول</Link>
          <Link className={s.primary} href="/signup">ابدأ تجربتك مجانًا</Link>
        </div>
      </div>
      {open ? <button className={s.navBackdrop} type="button" aria-label="إغلاق القائمة" onClick={close} /> : null}
    </header>
  );
}
