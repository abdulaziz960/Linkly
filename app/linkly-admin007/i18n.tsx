"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type Language = "ar" | "en";

const LanguageContext = createContext<Language>("ar");

export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const language = useContext(LanguageContext);
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  return { language, t };
}
