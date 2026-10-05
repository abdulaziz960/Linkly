"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AdminUser } from "./types";
import type { AdminSummary } from "../api/admin/summary/route";
import Icon from "./ds/Icon";
import { useConfirm } from "./ds/Dialog";
import { useTheme } from "./ds/theme";
import { NAV_GROUPS, type NavItem } from "./nav";
import { canAccessPath } from "../../lib/admin-permissions";
import { useAdminPermissions } from "./ds/permissions-context";

function badgeFor(item: NavItem, summary: AdminSummary | null) {
  if (!summary || !item.badge) return null;
  if (item.badge === "renewals") return summary.renewalsDue ? { count: summary.renewalsDue, tone: "danger" as const } : null;
  if (item.badge === "support") return summary.supportOpen ? { count: summary.supportOpen, tone: summary.supportUrgent ? ("danger" as const) : ("warning" as const) } : null;
  return summary.developmentPending ? { count: summary.developmentPending, tone: "warning" as const } : null;
}

function isActive(pathname: string, href: string) {
  if (href === "/linkly-admin007") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebar({ user, summary, collapsed, onToggleCollapsed }: {
  user: AdminUser;
  summary: AdminSummary | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const confirm = useConfirm();
  const { theme, toggle } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const { permissions } = useAdminPermissions();
  // Links to sections the member cannot open are not shown (the server blocks them regardless).
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canAccessPath(permissions, item.href)) })).filter((group) => group.items.length > 0);

  async function signOut() {
    if (signingOut) return;
    const ok = await confirm({ title: "تسجيل الخروج", description: "سيتم إنهاء جلستك الحالية في لوحة التحكم.", confirmLabel: "تسجيل الخروج" });
    if (!ok) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("logout failed");
      window.location.replace("/login");
    } catch {
      setSigningOut(false);
      window.alert("تعذر تسجيل الخروج. حاول مرة أخرى.");
    }
  }

  return (
    <aside className="ds-sidebar" aria-label="القائمة الجانبية">
      <div className="ds-sidebar-head">
        <Link href="/linkly-admin007" className="ds-brand" aria-label="Linkly - نظرة عامة">
          <Image src="/assets/linkly-logo.png" alt="" width={44} height={24} priority />
          <span>Linkly</span>
        </Link>
      </div>

      <nav className="ds-sidebar-scroll" aria-label="تنقل لوحة التحكم">
        {groups.map((group) => (
          <div className="ds-nav-group" key={group.label} role="group" aria-label={group.label}>
            <div className="ds-nav-label">{group.label}</div>
            {group.items.map((item) => {
              const badge = badgeFor(item, summary);
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ds-nav-link"
                  aria-current={active ? "page" : undefined}
                  data-badge={badge ? "" : undefined}
                  title={collapsed ? item.label : undefined}
                  aria-label={badge ? `${item.label}، ${badge.count} تنبيه` : undefined}
                >
                  <Icon name={item.icon} size={19} />
                  <span className="ds-nav-text">{item.label}</span>
                  {badge ? <span className="ds-count" data-tone={badge.tone}>{badge.count > 99 ? "99+" : badge.count}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="ds-sidebar-foot">
        <div className="ds-user-card">
          <span className="ds-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
          <span className="ds-user-meta">
            <strong>{user.name}</strong>
            <small>مدير المنصة</small>
          </span>
        </div>
        <div className="ds-sidebar-actions">
          <button type="button" className="ds-btn" data-variant="ghost" onClick={toggle} aria-label={theme === "dark" ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"} title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} /><span>{theme === "dark" ? "فاتح" : "داكن"}</span>
          </button>
          <button type="button" className="ds-btn" data-variant="ghost" onClick={signOut} disabled={signingOut} aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <Icon name="logout" size={16} /><span>خروج</span>
          </button>
          <button type="button" className="ds-btn" data-variant="ghost" onClick={onToggleCollapsed} aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"} aria-pressed={collapsed} title={collapsed ? "توسيع القائمة" : "طي القائمة"} style={{ gridColumn: "1 / -1" }}>
            <Icon name="panelLeft" size={16} /><span>{collapsed ? "توسيع" : "طي القائمة"}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
