"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { AdminUser } from "./types";
import NotificationBell from "./NotificationBell";
import { useLanguage } from "./i18n";
import type { Language } from "./i18n";

const navItems = [
  { href: "/admin", labelAr: "نظرة عامة", labelEn: "Overview" },
  { href: "/admin/clients", labelAr: "العملاء", labelEn: "Clients" },
  { href: "/admin/alerts", labelAr: "تنبيهات التجديد", labelEn: "Renewal alerts" },
  { href: "/admin/payments", labelAr: "المدفوعات", labelEn: "Payments" },
  { href: "/admin/plans", labelAr: "الباقات", labelEn: "Plans" },
  { href: "/admin/team", labelAr: "الفريق", labelEn: "Team" },
  { href: "/admin/logs", labelAr: "السجلات", labelEn: "Logs" }
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

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <span className="admin-brand-mark">
          <Image src="/assets/linkly-logo.png" alt="" width={44} height={44} />
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

      <nav className="admin-nav" aria-label={t("تنقل لوحة المزوّد", "Provider dashboard navigation")}>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""} prefetch>
            {t(item.labelAr, item.labelEn)}
          </Link>
        ))}
      </nav>

      <div className="admin-profile">
        <span>{user.name.slice(0, 1)}</span>
        <div>
          <strong>{user.name}</strong>
          <small>{t("مدير المنصة", "Platform admin")}</small>
        </div>
      </div>
    </aside>
  );
}
