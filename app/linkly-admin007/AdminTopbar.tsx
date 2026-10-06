"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminUser } from "./types";
import Icon from "./ds/Icon";
import { breadcrumbsFor, QUICK_ACTIONS } from "./nav";
import { canAccessPath } from "../../lib/admin-permissions";
import { useAdminPermissions } from "./ds/permissions-context";
import GlobalSearch from "./GlobalSearch";
import NotificationBell from "./NotificationBell";
import { useTheme } from "./ds/theme";
import { useConfirm } from "./ds/Dialog";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export default function AdminTopbar({ onOpenMenu, user }: { onOpenMenu: () => void; user: AdminUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const confirm = useConfirm();
  const [signingOut, setSigningOut] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const quickRef = useDismiss(quickOpen, () => setQuickOpen(false));
  const userRef = useDismiss(userOpen, () => setUserOpen(false));
  const crumbs = breadcrumbsFor(pathname);
  const { permissions } = useAdminPermissions();
  const quickActions = QUICK_ACTIONS.filter((action) => canAccessPath(permissions, action.href.split("?")[0]));

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

  useEffect(() => {
    setQuickOpen(false);
    setUserOpen(false);
  }, [pathname]);

  return (
    <header className="ds-topbar">
      <button type="button" className="ds-icon-btn ds-menu-btn" onClick={onOpenMenu} aria-label="فتح القائمة">
        <Icon name="menu" size={20} />
      </button>

      <nav className="ds-crumbs" aria-label="مسار الصفحة">
        {crumbs.map((crumb, index) => (
          <span key={crumb.label + index} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {index > 0 ? <Icon name="chevronLeft" size={14} /> : null}
            {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
          </span>
        ))}
      </nav>

      <div className="ds-topbar-spacer" />

      <GlobalSearch />

      {quickActions.length > 0 ? (
      <div className="ds-popover-wrap" ref={quickRef}>
        <button type="button" className="ds-btn" data-variant="primary" onClick={() => setQuickOpen((open) => !open)} aria-haspopup="menu" aria-expanded={quickOpen}>
          <Icon name="plus" size={16} /><span className="ds-hide-sm">إجراء سريع</span>
        </button>
        {quickOpen ? (
          <div className="ds-popover" role="menu" style={{ width: 240 }}>
            {quickActions.map((action) => (
              <button key={action.href} type="button" role="menuitem" className="ds-menu-item" onClick={() => router.push(action.href)}>
                <Icon name={action.icon} size={17} />{action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}

      <NotificationBell />

      <div className="ds-popover-wrap" ref={userRef}>
        <button type="button" className="ds-icon-btn" onClick={() => setUserOpen((open) => !open)} aria-haspopup="menu" aria-expanded={userOpen} aria-label="قائمة الحساب">
          <span className="ds-avatar" style={{ width: 32, height: 32 }} aria-hidden="true">{user.name.slice(0, 1)}</span>
        </button>
        {userOpen ? (
          <div className="ds-popover" role="menu" style={{ width: 260 }}>
            <div className="ds-popover-row" style={{ cursor: "default" }}>
              <div>
                <strong>{user.name}</strong>
                <span dir="ltr" style={{ textAlign: "start" }}>{user.email}</span>
                <small>مدير المنصة</small>
              </div>
            </div>
            <Link href="/linkly-admin007/settings" role="menuitem" className="ds-menu-item"><Icon name="settings" size={17} />إعدادات الحساب</Link>
            <button type="button" role="menuitem" className="ds-menu-item" onClick={toggle}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />{theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
            </button>
            <button type="button" role="menuitem" className="ds-menu-item" onClick={signOut} disabled={signingOut}>
              <Icon name="logout" size={17} />تسجيل الخروج
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
