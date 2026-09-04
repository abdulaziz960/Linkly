"use client";

import { useEffect, useState } from "react";

// Shared with the dashboard's own language preference (app/dashboard/
// DashboardClient.tsx uses the same key) so a language chosen anywhere in
// the product - landing page, login, signup, activation, billing - carries
// through to the dashboard instead of resetting to Arabic on every page.
const STORAGE_KEY = "audiencew-language";

export function useStoredLanguage(defaultLanguage: "ar" | "en" = "ar") {
  const [language, setLanguage] = useState<"ar" | "en">(defaultLanguage);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") setLanguage(stored);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, language);
  }, [language, loaded]);

  return [language, setLanguage] as const;
}
