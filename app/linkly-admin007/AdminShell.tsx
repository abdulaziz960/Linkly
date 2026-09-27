"use client";

import type { ReactNode } from "react";
import type { AdminUser } from "./types";
import AdminSidebar from "./AdminSidebar";
import { LanguageProvider } from "./i18n";

export default function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  return (
    <LanguageProvider language="ar">
      <AdminSidebar user={user} />
      <section className="admin-main">{children}</section>
    </LanguageProvider>
  );
}
