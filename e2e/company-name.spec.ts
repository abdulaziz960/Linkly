import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("the account owner renames the company from the profile window", async ({ page }) => {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.getByRole("button", { name: "الملف الشخصي" }).first().click();
  const profile = page.getByRole("dialog", { name: "الملف الشخصي" });
  const field = profile.locator(".company-name-field");

  // The real endpoint is reached and its answer shown (this test workspace has no subscription record).
  await field.getByRole("button", { name: "تعديل" }).click();
  await field.getByRole("textbox").fill("شركة اختبار الاسم");
  const sent = page.waitForRequest((request) => request.url().endsWith("/api/account/company") && request.method() === "PATCH");
  await field.getByRole("button", { name: "حفظ" }).click();
  expect((await sent).postDataJSON()).toEqual({ companyName: "شركة اختبار الاسم" });
  await expect(field.getByRole("alert")).toContainText("الاشتراك غير موجود");

  // Saved: the new name shows at once (the database update itself is covered in tests/company-name.test.ts).
  await page.route("**/api/account/company", (route) => route.fulfill({ json: { ok: true, companyName: "شركة اختبار الاسم" } }));
  await field.getByRole("button", { name: "حفظ" }).click();
  await expect(field).toContainText("شركة اختبار الاسم");
  await expect(field.getByRole("textbox")).toHaveCount(0);
});
