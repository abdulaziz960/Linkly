import { expect, test } from "@playwright/test";
import { computeCampaignStats } from "../lib/campaign-metrics";
import { skipPwaInstallPopup } from "./support";

test("campaign table separates processing completion from failed sends and partial delivery", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await skipPwaInstallPopup(page);
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  const failed = computeCampaignStats({ total: 804, statusCounts: [{ status: "فشل الإرسال", count: 804 }] });
  const partial = computeCampaignStats({ total: 2781, statusCounts: [{ status: "تم الإرسال", count: 2774 }, { status: "فشل الإرسال", count: 7 }], deliveryFailedCount: 432 });
  await page.route(/\/api\/campaigns(?:\?.*)?$/, route => route.fulfill({ json: { ok: true, data: [
    { id: "failed-preview", name: "zurex_Oil", sent: 0, total: 804, progress: "0%", status: "الحملة أنجزت", updatedAt: new Date().toISOString(), stats: failed },
    { id: "partial-preview", name: "Rheinol11", sent: 2774, total: 2781, progress: "99.7%", status: "الحملة أنجزت", updatedAt: new Date().toISOString(), stats: partial }
  ] } }));
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard?view=campaigns");
  await expect(page.getByRole("columnheader", { name: "نسبة الإرسال" })).toBeVisible();
  const failedRow = page.getByRole("row", { name: /zurex_Oil/ });
  await expect(failedRow.locator(".state.off")).toHaveText("فشل الإرسال");
  await expect(failedRow).toContainText("804 تعذّر إرسالها أو تسليمها");
  const partialRow = page.getByRole("row", { name: /Rheinol11/ });
  await expect(partialRow.locator(".state.warn")).toHaveText("انتهت مع إخفاقات");
  await expect(partialRow).toContainText("99.7%");
  await page.screenshot({ path: "reports/campaign-outcomes-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await failedRow.scrollIntoViewIfNeeded();
  await expect(failedRow.locator(".state.off")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "reports/campaign-outcomes-mobile.png" });
  expect(errors).toEqual([]);
});
