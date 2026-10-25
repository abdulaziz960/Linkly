import { expect, test } from "@playwright/test";

test("signup shows a message under each wrong field instead of a browser bubble", async ({ page }) => {
  await page.goto("/signup");
  const form = page.locator(".journey-form");
  await form.locator(".journey-submit").click();

  await expect(form.locator("#signup-companyName-error")).toHaveText("اكتب اسم النشاط التجاري");
  await expect(form.locator("#signup-businessType-error")).toBeVisible();
  await expect(form.locator("#signup-ownerEmail-error")).toBeVisible();
  await expect(form.locator("#signup-phone-error")).toBeVisible();
  await expect(form.locator("#signup-terms-error")).toBeVisible();
  await expect(form.locator('[name="companyName"]')).toHaveAttribute("aria-invalid", "true");
  await expect(form.locator('[name="companyName"]')).toHaveAttribute("aria-describedby", /signup-companyName-error/);
  await expect(form.locator('[name="companyName"]')).toBeFocused();
  await expect(form.getByRole("alert")).toContainText("راجع الحقول");

  // A wrong phone is explained when the field is left; fixing it clears the message.
  await form.locator('[name="phone"]').fill("12345");
  await form.locator('[name="ownerName"]').focus();
  await expect(form.locator("#signup-phone-error")).toContainText("رقم جوال سعودي صحيح");
  await form.locator('[name="phone"]').fill("0501234567");
  await form.locator('[name="ownerName"]').focus();
  await expect(form.locator("#signup-phone-error")).toHaveCount(0);
  // The Saudi-only rule is explained up front.
  await expect(form.locator("#signup-phone-hint")).toContainText("الجوال السعودية فقط");
});

test("the English signup page speaks English in its messages", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "English" }).click();
  const form = page.locator(".journey-form");
  await form.locator(".journey-submit").click();
  await expect(form.locator("#signup-companyName-error")).toHaveText("Enter your business name");
  await expect(form.locator("#signup-phone-hint")).toContainText("Saudi mobile numbers only");
  await expect(form.getByRole("alert")).toContainText("Please fix the fields");
});
