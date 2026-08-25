"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AdminUser } from "./types";
import AdminSidebar from "./AdminSidebar";
import { LanguageProvider } from "./i18n";
import type { Language } from "./i18n";

const STORAGE_KEY = "audiencew-admin-language";

export default function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ar");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ar") setLanguage(stored);
  }, []);

  function changeLanguage(next: Language) {
    setLanguage(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <LanguageProvider language={language}>
      <AdminSidebar user={user} language={language} onChangeLanguage={changeLanguage} />
      <section className="admin-main">{children}</section>
    </LanguageProvider>
  );
}
