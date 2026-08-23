"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type Language = "ar" | "en";

// Internal sentinel stored on a deleted message's text/lastMessage regardless
// of UI language - other views compare against this, so it must stay stable.
export const DELETED_MESSAGE_TEXT = "تم حذف هذه الرسالة";

export function isDeletedMessageText(text: string) {
  return text === DELETED_MESSAGE_TEXT;
}

const LanguageContext = createContext<Language>("ar");

export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const language = useContext(LanguageContext);
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  return { language, t };
}
