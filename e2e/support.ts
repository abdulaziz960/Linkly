import type { Page } from "@playwright/test";

/**
 * The dashboard opens an "install the app" popup as soon as it loads
 * (app/dashboard/components/PwaInstallPopup.tsx) and remembers "Later" for
 * the browser session. Tests that drive the dashboard mark it dismissed
 * up front so the backdrop never sits on top of what they click.
 */
export async function skipPwaInstallPopup(page: Page) {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem("linkly-pwa-install-popup-dismissed", "1");
    } catch {
      // Storage unavailable: the popup would not be remembered either way.
    }
  });
}
