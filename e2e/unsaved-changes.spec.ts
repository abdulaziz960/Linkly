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

test("a long form asks before it throws away typed changes", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard?view=campaigns");
  const builder = page.getByRole("dialog", { name: "حفظ حملة" });

  // Nothing typed: closing is immediate.
  await page.getByRole("button", { name: /حملة جديدة/ }).first().click();
  await expect(builder).toBeVisible();
  await builder.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(builder).toBeHidden();

  // Something typed: the app's own dialog asks first.
  await page.getByRole("button", { name: /حملة جديدة/ }).first().click();
  await builder.getByRole("textbox", { name: "اسم الحملة" }).fill("حملة لم تكتمل");
  await builder.getByRole("button", { name: "إغلاق", exact: true }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("تعديلات غير محفوظة");
  await ask.getByRole("button", { name: "متابعة التعديل" }).click();
  await expect(builder).toBeVisible();
  await expect(builder.getByRole("textbox", { name: "اسم الحملة" })).toHaveValue("حملة لم تكتمل");

  await builder.getByRole("button", { name: "إغلاق", exact: true }).click();
  await ask.getByRole("button", { name: "إغلاق وفقدان التعديلات" }).click();
  await expect(builder).toBeHidden();
});
