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
  // The cookie notice can appear a moment after the page loads and would sit on top of what the tests click.
  const lateNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  await lateNotice.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await lateNotice.isVisible()) await lateNotice.getByRole("button", { name: "رفض", exact: true }).click();
}

for (const [label, size] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]] as const) {
  test(`sign-out asks with the branded dialog, Esc keeps the session (${label})`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    let nativeDialogs = 0;
    page.on("dialog", async (dialog) => { nativeDialogs += 1; await dialog.dismiss(); });
    await signIn(page);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${label}.png`) });

    await page.getByRole("button", { name: "الملف الشخصي" }).first().click();
    await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("تسجيل الخروج");
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`confirm-${label}.png`) });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/dashboard/);
    expect(nativeDialogs).toBe(0);
  });
}

test("keyboard focus is visible on form fields", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth : "";
  });
  expect(outline).toMatch(/solid 2px/);
});

test("the profile window fits on one screen and sign-out is in plain view", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await signIn(page);
  await page.getByRole("button", { name: "الملف الشخصي" }).first().click();
  const dialog = page.getByRole("dialog", { name: "الملف الشخصي" });
  await expect(dialog).toBeVisible();
  const signOut = dialog.getByRole("button", { name: "تسجيل الخروج", exact: true });
  await expect(signOut).toBeInViewport({ ratio: 1 });
  // Nothing inside the window needs scrolling.
  const overflow = await dialog.locator(".account-modal-body").evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("profile-window.png") });
});
