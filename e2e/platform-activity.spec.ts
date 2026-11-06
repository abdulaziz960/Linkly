import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("each ad platform card has a customers pop-up and a conversions-log pop-up", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Meta answers with sample rows so the tables are checked; the other platforms use the real (empty) data.
  await page.route("**/api/ad-platforms?platform=meta&kind=leads*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { leads: [{ conversationId: "c1", name: "نورة السبيعي", phone: "966500000001", stage: "جديد", source: "lead_form", campaign: "فيليا الافتتاح", createdAt: new Date().toISOString() }] } }) }));
  await page.route("**/api/ad-platforms?platform=meta&kind=events*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { events: [{ conversationId: "c1", name: "نورة السبيعي", phone: "966500000001", stage: "مؤهل", eventName: "Lead", ok: true, message: "", createdAt: new Date().toISOString() }, { conversationId: "c2", name: "عبير", phone: "966500000002", stage: "فاز", eventName: "Purchase", ok: false, message: "bad token", createdAt: new Date().toISOString() }] } }) }));

  await page.goto("/dashboard?view=integrations");
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });

  await expect(page.getByRole("button", { name: "عملاء المنصة" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "سجل التحويلات" })).toHaveCount(3);
  if (shots) await page.screenshot({ path: join(shots, "platform-activity-cards.png") });

  await page.getByRole("button", { name: "عملاء المنصة" }).first().click();
  const leads = page.getByRole("dialog");
  await expect(leads.getByText("نورة السبيعي")).toBeVisible();
  await expect(leads.getByText("نموذج إعلان")).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, "platform-activity-leads.png") });
  await leads.getByRole("button", { name: "إغلاق" }).first().click();

  await page.getByRole("button", { name: "سجل التحويلات" }).first().click();
  const log = page.getByRole("dialog");
  await expect(log.getByText("مؤهل")).toBeVisible();
  // «فاز» is shown as «شراء», and the customer is the first (right-most) column.
  await expect(log.getByText("شراء", { exact: true })).toBeVisible();
  await expect(log.getByText("فاز", { exact: true })).toHaveCount(0);
  await expect(log.getByRole("columnheader").first()).toHaveText("العميل");
  await expect(log.getByText("فشل", { exact: true }).first()).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, "platform-activity-events.png") });
  await log.getByRole("button", { name: "إغلاق" }).first().click();

  // The other two platforms open the same pop-ups with the real, empty data.
  for (const index of [1, 2]) {
    await page.getByRole("button", { name: "عملاء المنصة" }).nth(index).click();
    await expect(page.getByRole("dialog").getByText("لا يوجد عملاء من هذه المنصة في هذه الفترة.")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "إغلاق" }).first().click();
    await page.getByRole("button", { name: "سجل التحويلات" }).nth(index).click();
    await expect(page.getByRole("dialog").getByText("لم تُرسل أي أحداث لهذه المنصة في هذه الفترة.")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "إغلاق" }).first().click();
  }
});
