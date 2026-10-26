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
  await page.locator(".camp-summary summary").click();
  await expect(page.getByRole("region", { name: "مسار الرسائل" })).toBeVisible();
  await expect(page.getByRole("region", { name: "ملخص الحملات" }).getByRole("button")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("campaigns-overview.png") });

  await page.getByRole("button", { name: "الرصيد و الشحن" }).click();
  // The balance is a number (0 for a new workspace), never a placeholder and never left loading.
  const total = page.locator(".campaign-balance-total strong");
  await expect(total).toHaveText(/^[\d,]+$/);
  await page.screenshot({ path: testInfo.outputPath("campaigns-balance.png") });
});

test("campaigns table: real numbers, notes, the row menu and a typed delete confirmation", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/dashboard?view=campaigns");
  const row = page.getByRole("row", { name: /حملة العرض الأخير/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("عرض نهاية الأسبوع");
  await expect(row).toContainText("vip");
  // 5 of 7 sent: 71.4%, nothing waiting, one failed + one opted out.
  await expect(row).toContainText("71.4%");
  await expect(row).not.toContainText("بالانتظار");
  await page.screenshot({ path: testInfo.outputPath("campaigns-table.png") });

  // The 'pending' card shows only campaigns that still have recipients waiting.
  await page.locator(".camp-summary summary").click();
  await page.getByRole("region", { name: "ملخص الحملات" }).getByRole("button", { name: /بانتظار الإرسال/ }).click();
  await expect(page.getByRole("row", { name: /حملة مجدولة/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /حملة العرض الأخير/ })).toHaveCount(0);
  await page.getByRole("region", { name: "ملخص الحملات" }).getByRole("button", { name: /بانتظار الإرسال/ }).click();

  // Delete is inside the menu and needs the campaign's name typed.
  await page.getByRole("row", { name: /حملة العرض الأخير/ }).getByRole("button", { name: /خيارات حملة العرض الأخير/ }).click();
  await page.getByRole("menuitem", { name: /حذف/ }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "حذف نهائي" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill("حملة العرض الأخير");
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("campaigns-delete-confirm.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: /حملة العرض الأخير/ })).toBeVisible();

  // Archive moves it out of the default list.
  await page.getByRole("row", { name: /حملة العرض الأخير/ }).getByRole("button", { name: /خيارات حملة العرض الأخير/ }).click();
  await page.getByRole("row", { name: /حملة العرض الأخير/ }).getByRole("button", { name: "أرشفة" }).click();
  await expect(page.getByRole("row", { name: /حملة العرض الأخير/ })).toHaveCount(0);
});

test("upcoming campaigns are listed with a way to change the time, and a short balance is flagged", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/dashboard?view=campaigns");
  await page.getByRole("button", { name: /^مجدولة/ }).click();
  const upcoming = page.locator(".upcoming-board");
  await expect(upcoming).toContainText("حملة قادمة");
  // The saved draft without a send time is not "upcoming".
  await expect(upcoming).not.toContainText("حملة مجدولة");
  // The balance of the test workspace is 0, so the 3 queued messages are not covered.
  await expect(page.getByRole("alert").filter({ hasText: "رصيدك لا يكفي لكل الحملات المنتظرة" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("campaigns-upcoming.png") });

  await upcoming.getByRole("button", { name: "تعديل الموعد" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل موعد الحملة" });
  await dialog.locator('input[type="datetime-local"]').fill("2020-01-01T10:00");
  await dialog.getByRole("button", { name: "حفظ الموعد" }).click();
  await expect(dialog.getByRole("alert")).toContainText("المستقبل");
  const later = new Date(Date.now() + 9 * 24 * 3600 * 1000 + 3 * 3600 * 1000).toISOString().slice(0, 16);
  await dialog.locator('input[type="datetime-local"]').fill(later);
  await dialog.getByRole("button", { name: "حفظ الموعد" }).click();
  await expect(dialog).toBeHidden();
});

test("campaigns table becomes cards on a phone without sideways scrolling", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/dashboard?view=campaigns");
  const card = page.locator(".campaigns-table tbody tr", { hasText: "حملة قادمة" });
  await expect(card).toBeVisible();
  await expect(page.locator(".campaigns-table thead")).toBeHidden();
  await expect(card.locator("td[data-label='الحملة']")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("campaigns-mobile.png") });
});

test("the row menu opens in full even when the table has a single row", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard?view=campaigns");
  await page.getByPlaceholder("بحث باسم الحملة...").fill("حملة قادمة");
  await expect(page.locator(".campaigns-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: /خيارات حملة قادمة/ }).click();
  const items = page.getByRole("menuitem");
  expect(await items.count()).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < (await items.count()); index += 1) {
    const item = items.nth(index);
    await expect(item).toBeInViewport({ ratio: 1 });
    // Nothing (such as the table's own scroll box) covers the item: the page's own hit-test lands on it.
    const covered = await item.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return !(top === element || element.contains(top));
    });
    expect(covered).toBe(false);
  }
  await page.keyboard.press("Escape");
  await expect(items.first()).toBeHidden();
});

test("a workspace without campaigns sees how to start, not an empty table", async ({ page }, testInfo) => {
  await signIn(page);
  for (const id of ["browser-campaign-done", "browser-campaign-draft", "browser-campaign-upcoming"]) {
    const response = await page.request.delete(`/api/campaigns/${id}`);
    expect(response.ok()).toBeTruthy();
  }
  await page.goto("/dashboard?view=campaigns");
  await expect(page.getByRole("heading", { name: "ابدأ أول حملة واتساب" })).toBeVisible();
  await expect(page.locator(".campaign-onboarding li")).toHaveCount(3);
  await expect(page.locator(".campaigns-table")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("campaigns-empty.png") });
});
