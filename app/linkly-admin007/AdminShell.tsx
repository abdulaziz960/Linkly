"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AdminUser } from "./types";
import type { AdminPermission } from "../../lib/admin-permissions";
import { AdminPermissionsProvider } from "./ds/permissions-context";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import { LanguageProvider } from "./i18n";
import { ThemeProvider } from "./ds/theme";
import { ToastProvider } from "./ds/Toast";
import { ConfirmProvider } from "./ds/Dialog";
import { useAdminSummary } from "./useAdminSummary";
import "./ds/ds.css";

export default function AdminShell({ user, permissions, children }: { user: AdminUser; permissions: AdminPermission[]; children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const summary = useAdminSummary();

  useEffect(() => setDrawerOpen(false), [pathname]);

  // Phones: the open menu is a modal drawer. Focus moves into it and stays there, the page behind
  // does not scroll, Esc closes it, and focus goes back to the menu button.
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("[data-drawer-close]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const items = [...drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((item) => item.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // The drawer only exists on narrow screens: widening the window closes it.
    const wide = window.matchMedia("(min-width: 901px)");
    const onWide = () => { if (wide.matches) setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [drawerOpen]);

  return (
    <LanguageProvider language="ar">
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AdminPermissionsProvider permissions={permissions}>
            <a href="#admin-content" className="ds-skip">تخطي إلى المحتوى</a>
            <div className="ds-app" data-drawer={drawerOpen ? "open" : "closed"}>
              <AdminSidebar summary={summary} drawerRef={drawerRef} drawerOpen={drawerOpen} onCloseDrawer={() => setDrawerOpen(false)} />
              <div className="ds-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
              <div className="ds-main">
                <AdminTopbar onOpenMenu={() => setDrawerOpen(true)} user={user} />
                <section className="ds-content" id="admin-content" tabIndex={-1}>{children}</section>
              </div>
            </div>
            </AdminPermissionsProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
