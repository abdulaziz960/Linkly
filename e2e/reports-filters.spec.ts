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

test("reports: filters first, they apply at once and are remembered", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/dashboard?view=reports");
  const page_ = page.locator(".reports-page");
  await expect(page_.getByRole("heading", { name: "الملخص التنفيذي" })).toBeVisible();

  // The filters bar sits right under the page header, before the attention list and the summary.
  const order = await page_.evaluate((root) => {
    const summary = [...root.querySelectorAll("h2")].find((h) => h.textContent?.includes("الملخص التنفيذي"));
    const filters = root.querySelector(".reports-filters");
    return summary && filters ? Boolean(filters.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
  });
  expect(order).toBe(true);
  await expect(page_.getByRole("button", { name: "تطبيق الفلاتر" })).toHaveCount(0);

  // A period applies as soon as it is picked.
  const range = page_.locator(".report-filter-actions span");
  const before = await range.textContent();
  await page_.getByRole("button", { name: "آخر 30 يوماً" }).click();
  await expect(range).not.toHaveText(before ?? "");

  // The extra filters are folded away until asked for.
  const customerType = page_.locator(".report-filter-grid label", { hasText: "نوع العميل" });
  await expect(customerType).toHaveCount(0);
  await page_.getByRole("button", { name: "المزيد من الفلاتر" }).click();
  await expect(customerType).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("reports.png") });

  // The choice survives leaving and coming back without a link.
  const chosen = await range.textContent();
  await page.goto("/dashboard?view=reports");
  await expect(page_.locator(".report-filter-actions span")).toHaveText(chosen ?? "");
});
