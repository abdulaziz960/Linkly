"use client";

import { usePathname } from "next/navigation";
import type { AdminUser } from "./types";

const navItems = [
  { href: "/admin", label: "نظرة عامة" },
  { href: "/admin/clients", label: "العملاء" },
  { href: "/admin/alerts", label: "تنبيهات التجديد" },
  { href: "/admin/payments", label: "المدفوعات" },
  { href: "/admin/plans", label: "الباقات" },
  { href: "/admin/team", label: "الفريق" },
  { href: "/admin/logs", label: "السجلات" }
];

export default function AdminSidebar({ user }: { user: AdminUser }) {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <span className="admin-brand-mark">
          <img src="/assets/audiencew-logo.png" alt="" />
        </span>
        <div>
          <strong>AudienceW</strong>
          <span>لوحة المزوّد</span>
        </div>
      </div>

      <nav className="admin-nav" aria-label="تنقل لوحة المزوّد">
        {navItems.map((item) => (
          <a key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="admin-profile">
        <span>{user.name.slice(0, 1)}</span>
        <div>
          <strong>{user.name}</strong>
          <small>مدير المنصة</small>
        </div>
      </div>
    </aside>
  );
}
