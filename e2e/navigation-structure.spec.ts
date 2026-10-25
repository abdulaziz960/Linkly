import { expect, test, type Page } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

async function signIn(page: Page) {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const lateNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  await lateNotice.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await lateNotice.isVisible()) await lateNotice.getByRole("button", { name: "رفض", exact: true }).click();
}

test("the sidebar shows names and groups by default and can be folded; the choice is remembered", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const shell = page.locator(".dashboard-shell");
  await expect(shell).toHaveClass(/sidebar-expanded/);
  const nav = page.getByRole("navigation");
  await expect(nav.locator(".dashboard-nav-label").first()).toBeVisible();
  await expect(nav.getByText("العمل اليومي", { exact: true })).toBeVisible();
  await expect(nav.getByText("الإدارة", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sidebar-expanded.png") });

  await page.getByRole("button", { name: "طيّ القائمة إلى أيقونات" }).click();
  await expect(shell).not.toHaveClass(/sidebar-expanded/);
  await expect(nav.locator(".dashboard-nav-label").first()).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("sidebar-folded.png") });

  await page.reload();
  await expect(page.locator(".dashboard-shell")).not.toHaveClass(/sidebar-expanded/);
  await page.getByRole("button", { name: "توسيع القائمة" }).click();
  await expect(page.locator(".dashboard-shell")).toHaveClass(/sidebar-expanded/);
});

test("related pages are tabs of one entry and the old addresses open the right tab", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const nav = page.getByRole("navigation");
  // One sidebar entry each, no separate "الأتمتة", "العروض البريدية" or "العلامة التجارية" entries.
  await expect(nav.getByRole("button", { name: "الرد الآلي والأتمتة", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "الأتمتة", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "الحملات والعروض البريدية", exact: true })).toBeVisible();

  await page.goto("/dashboard?view=automations");
  await expect(page.getByRole("tab", { name: "الأتمتة", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "الرد الآلي", exact: true })).toBeVisible();

  await page.goto("/dashboard?view=emailPromotions");
  await expect(page.getByRole("tab", { name: "العروض البريدية", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "حملات واتساب", exact: true })).toBeVisible();

  await page.goto("/dashboard?view=branding");
  await expect(page.getByRole("tab", { name: "العلامة التجارية", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "القنوات", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settings-tabs.png") });
});

test("account actions sit in one toolbar with names beside the icons on a large screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const toolbar = page.getByRole("toolbar", { name: "إجراءات الحساب" });
  await expect(toolbar).toBeVisible();
  for (const name of ["حسابي", "الدعم", "التطوير", "الباقات"]) await expect(toolbar.getByText(name, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("top-actions.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(toolbar.getByText("حسابي", { exact: true })).toBeHidden();
  await expect(toolbar.getByRole("button", { name: "الملف الشخصي" })).toBeVisible();
});

test("every page header is the shared one with a single H1", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  for (const view of ["campaigns", "emailPromotions", "automations", "bot", "reports"]) {
    await page.goto(`/dashboard?view=${view}`);
    await expect(page.locator("header.page-header")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
  }
});
