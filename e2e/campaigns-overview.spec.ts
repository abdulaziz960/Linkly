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

test("campaigns overview shows the funnel and a real balance on both tabs", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/dashboard?view=campaigns");
  await expect(page.getByRole("region", { name: "مسار الرسائل" })).toBeVisible();
  await expect(page.getByRole("region", { name: "ملخص الحملات" }).getByRole("button")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("campaigns-overview.png") });

  await page.getByRole("button", { name: "الرصيد و الشحن" }).click();
  // The balance is a number (0 for a new workspace), never a placeholder and never left loading.
  const total = page.locator(".campaign-balance-total strong");
  await expect(total).toHaveText(/^[\d,]+$/);
  await page.screenshot({ path: testInfo.outputPath("campaigns-balance.png") });
});
