import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

test("the page-SEO screen lists the pricing page and every solution guide, and an edit shows on the public page within seconds", async ({ page }) => {
  test.setTimeout(120000);
  if (shots) mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);

  await page.goto("/linkly-admin007/page-seo");
  await expect(page.getByText("الأسعار (عربي)")).toBeVisible();
  await expect(page.getByText("حلول: إدارة واتساب لفريق خدمة العملاء من صندوق واحد (عربي)")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/page-seo-list.png`, fullPage: true });

  // A saved title shows on the public guide (the page is rendered on each request).
  const saved = await page.request.put("/api/admin/page-seo", { data: { path: "/solutions/whatsapp-team-inbox", metaTitle: "عنوان من لوحة الإدارة" } });
  expect(saved.ok()).toBeTruthy();
  // The public pages keep the SEO rows in memory for up to 30 seconds, so the new title appears within that time.
  await expect(async () => {
    await page.goto("/solutions/whatsapp-team-inbox");
    await expect(page).toHaveTitle("عنوان من لوحة الإدارة", { timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
});
