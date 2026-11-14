"use client";

import { createContext, useContext, type ReactNode } from "react";

import { PREFS_COOKIE_PATH } from "./prefs";

// The admin panel is light-only. Preferences (such as sidebar state) still live in cookies so the
// server layout can render them on the very first paint.

export function writePreference(name: string, value: string | null) {
  const maxAge = value === null ? 0 : 60 * 60 * 24 * 365;
  document.cookie = `${name}=${value ?? ""}; path=${PREFS_COOKIE_PATH}; max-age=${maxAge}; samesite=lax`;
}

const ThemeContext = createContext<{ theme: "light" }>({ theme: "light" });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={{ theme: "light" }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
