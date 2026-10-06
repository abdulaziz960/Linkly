"use client";

import { useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <LanguageProvider language="ar">
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AdminPermissionsProvider permissions={permissions}>
            <a href="#admin-content" className="ds-skip">تخطي إلى المحتوى</a>
            <div className="ds-app" data-drawer={drawerOpen ? "open" : "closed"}>
              <AdminSidebar summary={summary} />
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
