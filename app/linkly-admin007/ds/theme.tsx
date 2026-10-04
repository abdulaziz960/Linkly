"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { PREFS_COOKIE_PATH, THEME_COOKIE } from "./prefs";

export type Theme = "light" | "dark";

// Preferences live in cookies (not localStorage) so the server layout can render
// the right theme and sidebar state on the very first paint - no flash, no script.

export function writePreference(name: string, value: string | null) {
  const maxAge = value === null ? 0 : 60 * 60 * 24 * 365;
  document.cookie = `${name}=${value ?? ""}; path=${PREFS_COOKIE_PATH}; max-age=${maxAge}; samesite=lax`;
}

function hasCookie(name: string) {
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${name}=`));
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void; toggle: () => void }>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {}
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  const apply = useCallback((next: Theme) => {
    setThemeState(next);
    document.querySelector(".admin-shell")?.setAttribute("data-theme", next);
  }, []);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".admin-shell");
    const current = shell?.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setThemeState(current);
    // First visit with no saved choice: follow the operating system once.
    if (!hasCookie(THEME_COOKIE) && window.matchMedia("(prefers-color-scheme: dark)").matches) apply("dark");
  }, [apply]);

  const setTheme = useCallback((next: Theme) => {
    apply(next);
    writePreference(THEME_COOKIE, next);
  }, [apply]);

  const value = useMemo(() => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
