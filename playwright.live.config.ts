import { defineConfig } from "@playwright/test";

/**
 * Read-only checks against the real site (https://linklysa.io by default).
 * No sign-up, no login, no messages: only public pages and headers.
 * Run: npx playwright test -c playwright.live.config.ts
 */
export default defineConfig({
  testDir: ".",
  testMatch: ["e2e-live/*.spec.ts", "e2e/public-site-audit.spec.ts", "e2e/seo-pages.spec.ts"],
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.LIVE_BASE_URL || "https://linklysa.io",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    screenshot: "only-on-failure"
  }
});
