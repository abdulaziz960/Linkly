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

test("campaigns table: real numbers, notes, the row menu and a typed delete confirmation", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/dashboard?view=campaigns");
  const row = page.getByRole("row", { name: /حملة العرض الأخير/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("عرض نهاية الأسبوع");
  await expect(row).toContainText("vip");
  // 5 of 7 sent: 71.4%, nothing waiting, one failed + one opted out.
  await expect(row).toContainText("71.4%");
  await expect(row.locator("td[data-label='فشلت']")).toHaveText("2");
  await expect(row).not.toContainText("بالانتظار");
  await page.screenshot({ path: testInfo.outputPath("campaigns-table.png") });

  // The 'pending' card shows only campaigns that still have recipients waiting.
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
  await page.getByRole("menuitem", { name: "أرشفة" }).click();
  await expect(page.getByRole("row", { name: /حملة العرض الأخير/ })).toHaveCount(0);
});
