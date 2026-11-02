import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

// Typing in one field of an admin dialog must never move the cursor to another one (the dialog used to refocus its first
// field on every keystroke because the callbacks it was given changed on every render).
test("typing in an admin dialog keeps the cursor in the field being typed in", async ({ page }) => {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);

  await page.goto("/linkly-admin007/discount-codes");
  await page.getByRole("button", { name: /كود جديد|إنشاء كود|إضافة كود/ }).first().click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByLabel("اسم الكود");
  const code = dialog.getByLabel("كود الخصم");
  await expect(name).toBeFocused();

  await code.click();
  await code.pressSequentially("SUMMER2026", { delay: 30 });
  await expect(code).toBeFocused();
  await expect(code).toHaveValue("SUMMER2026");
  await expect(name).toHaveValue("");
});
