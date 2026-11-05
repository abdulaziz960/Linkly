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

  // A tall window keeps the whole card on screen: the select list closes when the page scrolls under it.
  await page.setViewportSize({ width: 1280, height: 1800 });
  const unique = Date.now().toString(36);
  const employeeName = `عزام ${unique}`;
  const created = await page.request.post("/api/employees", { data: { name: employeeName, email: `azzam-${unique}@browser.test` } });
  expect(created.ok()).toBe(true);

  await page.goto("/dashboard?view=developers");
  const card = page.locator(".panel", { has: page.getByRole("heading", { name: "ربط موظفي الـCRM" }) });
  await expect(card).toBeVisible();
  // The select list closes when the page scrolls under it, so put the card mid-screen first.
  await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await card.getByLabel("معرّف الموظف في الـCRM").fill("crm-emp-12");
  await card.getByRole("button", { name: "موظف لنكلي" }).click();
  await page.getByRole("option", { name: employeeName }).click();
  await card.getByRole("button", { name: "ربط", exact: true }).click();
  // The AI auto-reply for assigned leads is off until the owner turns it on (and warns when no own AI key is set).
  const aiToggle = card.getByLabel("ردّ تلقائي بالذكاء الاصطناعي على العملاء المُسنَدين");
  await expect(aiToggle).not.toBeChecked();
  await aiToggle.check();
  await expect(card.getByRole("alert")).toContainText("مفتاح خاص");
  await page.reload();
  await expect(page.locator(".panel", { has: page.getByRole("heading", { name: "ربط موظفي الـCRM" }) }).getByLabel("ردّ تلقائي بالذكاء الاصطناعي على العملاء المُسنَدين")).toBeChecked();
  await page.locator(".panel", { has: page.getByRole("heading", { name: "ربط موظفي الـCRM" }) }).getByLabel("ردّ تلقائي بالذكاء الاصطناعي على العملاء المُسنَدين").uncheck();
  await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const row = card.locator("li", { hasText: "crm-emp-12" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(employeeName);
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, "crm-employee-map.png") });
  }
  await row.getByRole("button", { name: "حذف" }).click();
  await expect(row).toHaveCount(0);
});
