import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("the owner maps a CRM employee id to a Linkly employee", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  const created = await page.request.post("/api/employees", { data: { name: "عزام الاختبار", email: "azzam-crm@browser.test" } });
  expect(created.ok()).toBe(true);

  await page.goto("/dashboard?view=developers");
  const card = page.locator(".panel", { has: page.getByRole("heading", { name: "ربط موظفي الـCRM" }) });
  await expect(card).toBeVisible();
  // The select list closes when the page scrolls under it, so put the card mid-screen first.
  await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await card.getByLabel("معرّف الموظف في الـCRM").fill("crm-emp-12");
  await card.getByRole("button", { name: "موظف لنكلي" }).click();
  await page.getByRole("option", { name: "عزام الاختبار" }).click();
  await card.getByRole("button", { name: "ربط", exact: true }).click();
  const row = card.locator("li", { hasText: "crm-emp-12" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("عزام الاختبار");
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, "crm-employee-map.png") });
  }
  await row.getByRole("button", { name: "حذف" }).click();
  await expect(row).toHaveCount(0);
});
