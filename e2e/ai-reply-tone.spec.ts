import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

test("the owner picks how the assistant talks to customers and it is kept", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.locator(".dashboard-sidebar").getByText("مساعد AI وقاعدة المعرفة").click();
  const group = page.getByRole("radiogroup", { name: "أسلوب الرد" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio", { name: /سعودي عامي/ })).toBeChecked();

  await group.getByRole("radio", { name: /رسمي/ }).check();
  await expect(page.getByText("تم حفظ أسلوب الرد")).toBeVisible();
  if (shots) await group.scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${shots}/ai-tone.png` }));

  await page.reload();
  await page.locator(".dashboard-sidebar").getByText("مساعد AI وقاعدة المعرفة").click();
  await expect(page.getByRole("radiogroup", { name: "أسلوب الرد" }).getByRole("radio", { name: /رسمي/ })).toBeChecked();

  // Back to the default so other tests are not affected.
  await page.getByRole("radiogroup", { name: "أسلوب الرد" }).getByRole("radio", { name: /سعودي عامي/ }).check();
  await expect(page.getByText("تم حفظ أسلوب الرد")).toBeVisible();
});
