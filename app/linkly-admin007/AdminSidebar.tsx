"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminUser } from "./types";
import NotificationBell from "./NotificationBell";
import { useLanguage } from "./i18n";
import type { Language } from "./i18n";

const navItems = [
  { href: "/linkly-admin007", labelAr: "نظرة عامة", labelEn: "Overview" },
  { href: "/linkly-admin007/clients", labelAr: "العملاء", labelEn: "Clients" },
  { href: "/linkly-admin007/alerts", labelAr: "تنبيهات التجديد", labelEn: "Renewal alerts" },
  { href: "/linkly-admin007/support", labelAr: "الدعم الفني", labelEn: "Support" },
  { href: "/linkly-admin007/development", labelAr: "التطوير", labelEn: "Development" },
  { href: "/linkly-admin007/payments", labelAr: "المدفوعات", labelEn: "Payments" },
  { href: "/linkly-admin007/plans", labelAr: "الباقات", labelEn: "Plans" },
  { href: "/linkly-admin007/team", labelAr: "الفريق", labelEn: "Team" },
  { href: "/linkly-admin007/usage", labelAr: "الاستخدام", labelEn: "Usage" },
  { href: "/linkly-admin007/logs", labelAr: "السجلات", labelEn: "Logs" },
  { href: "/linkly-admin007/admin-actions", labelAr: "إجراءات الأدمن", labelEn: "Admin actions" }
];

export default function AdminSidebar({
  user,
  language,
  onChangeLanguage
}: {
  user: AdminUser;
  language: Language;
  onChangeLanguage: (language: Language) => void;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [profileOpen, setProfileOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setProfileOpen(false);
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileOpen(false);
        profileTriggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [profileOpen]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("logout failed");
      window.location.replace("/login");
    } catch {
      setSignOutError(t("تعذر تسجيل الخروج. حاول مرة أخرى.", "Could not sign out. Please try again."));
      setSigningOut(false);
    }
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <span className="admin-brand-mark">
          <Image src="/assets/linkly-logo.png" alt="" width={56} height={31} />
        </span>
        <div>
          <strong>Linkly</strong>
        </div>
        <NotificationBell />
      </div>

      <div className="admin-lang-toggle" role="group" aria-label={t("اللغة", "Language")}>
        <button type="button" aria-pressed={language === "ar"} className={language === "ar" ? "active" : ""} onClick={() => onChangeLanguage("ar")}>
          العربية
        </button>
        <button type="button" aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => onChangeLanguage("en")}>
          English
        </button>
      </div>

      <button type="button" className="admin-mobile-nav-toggle" aria-controls="admin-primary-nav" aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}>
        <span aria-hidden="true">☰</span> {t("القائمة", "Menu")}
      </button>

      <nav id="admin-primary-nav" className={`admin-nav${navOpen ? " is-open" : ""}`} aria-label={t("تنقل لوحة المزوّد", "Provider dashboard navigation")}>
        {navItems.map((item, index) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setNavOpen(false)} prefetch>
            <span className="admin-nav-icon" aria-hidden="true">{["▦", "♙", "◷", "☏", "✦", "▤", "◇", "♧", "◫", "≡", "⚑"][index]}</span>
            {t(item.labelAr, item.labelEn)}
          </Link>
        ))}
      </nav>

      <div className="admin-profile" ref={profileRef}>
        <button
          type="button"
          ref={profileTriggerRef}
          className="admin-profile-trigger"
          onClick={() => setProfileOpen((open) => !open)}
          aria-expanded={profileOpen}
          aria-controls="admin-profile-popover"
        >
          <span className="admin-profile-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
          <span className="admin-profile-identity">
            <strong>{user.name}</strong>
            <small>{t("مدير المنصة", "Platform admin")}</small>
          </span>
          <span className="admin-profile-chevron" aria-hidden="true">⌃</span>
        </button>
        {profileOpen ? (
          <div id="admin-profile-popover" className="admin-profile-popover">
            <div className="admin-profile-popover-info">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
              <span>{t("مدير المنصة", "Platform admin")}</span>
            </div>
            <button type="button" className="admin-profile-popover-signout" onClick={signOut} disabled={signingOut}>
              <span aria-hidden="true">↪</span> {signingOut ? t("جارٍ تسجيل الخروج…", "Signing out…") : t("تسجيل الخروج", "Sign out")}
            </button>
            {signOutError ? <p className="admin-profile-error" role="alert">{signOutError}</p> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
