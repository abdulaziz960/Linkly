import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("the owner writes a project profile and manages the visit schedule and its daily limit", async ({ page }) => {
  test.setTimeout(180000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 1500 });

  await page.goto("/dashboard?view=pipeline");
  // --- project profile
  await page.getByRole("tab", { name: "المشاريع" }).click();
  await page.locator(".pipeline-view").getByRole("button", { name: "إضافة مشروع" }).click();
  const dialog = page.getByRole("dialog", { name: "إضافة مشروع" });
  await dialog.getByLabel("اسم المشروع").fill("مشروع الياسمين");
  await dialog.getByLabel("الموقع").fill("شمال الرياض");
  await dialog.getByLabel(/تفاصيل المشروع/).fill("فلل 4 غرف بمساحة 320 متر، تسليم 2027، الدفع على 5 سنوات");
  await dialog.getByLabel(/حد الزيارات اليومي لهذا المشروع/).fill("2");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  const card = page.locator("article", { hasText: "مشروع الياسمين" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("حد 2 زيارة/يوم");
  if (shots) await page.screenshot({ path: join(shots, "projects-tab.png") });

  // --- visits: limit, manual booking, status, delete
  await page.getByRole("tab", { name: "المواعيد" }).click();
  // Let the tab finish its first load, or that late response would overwrite what is typed next.
  await expect(page.getByRole("group", { name: "امتلاء الأيام القادمة" }).getByRole("button").nth(1)).toBeVisible();
  const limit = page.getByLabel("الحد الأقصى للزيارات في اليوم");
  await limit.fill("1");
  await page.getByRole("button", { name: "حفظ الحد" }).click();
  await expect(page.getByRole("status")).toContainText("تم حفظ حد الزيارات اليومي");

  const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const book = async (name: string, phone: string) => {
    await page.getByRole("button", { name: "إضافة موعد" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة موعد" });
    await form.getByLabel("التاريخ").fill(day);
    await form.getByLabel("اسم العميل").fill(name);
    await form.getByLabel("جوال العميل").fill(phone);
    await form.getByRole("button", { name: "حجز الموعد" }).click();
    return form;
  };
  await (await book("فهد", "966501112233")).waitFor({ state: "detached" });
  const row = page.locator("article", { hasText: "فهد" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("محجوز");
  if (shots) await page.locator(".pipeline-view").screenshot({ path: join(shots, "visits-page.png") });

  // The day is now full (limit 1): a second booking is refused with a clear message.
  const second = await book("سعد", "966504445566");
  await expect(second.getByRole("alert")).toContainText("اكتمل عدد الزيارات");
  if (shots) await page.screenshot({ path: join(shots, "visits-tab.png") });
  await second.getByRole("button", { name: "إلغاء" }).click();

  // Cancelling gives the place back.
  await row.getByRole("button", { name: "إلغاء", exact: true }).click();
  await expect(row).toContainText("ملغي");
  await (await book("سعد", "966504445566")).waitFor({ state: "detached" });
  await expect(page.locator("article", { hasText: "سعد" })).toBeVisible();

  // Clean up so other specs see an empty schedule and no projects.
  for (const name of ["فهد", "سعد"]) {
    await page.locator("article", { hasText: name }).getByRole("button", { name: "حذف الموعد" }).click();
    await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  }
  await page.getByRole("tab", { name: "المشاريع" }).click();
  await page.locator("article", { hasText: "مشروع الياسمين" }).getByRole("button", { name: "حذف مشروع الياسمين" }).click();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.locator("article", { hasText: "مشروع الياسمين" })).toHaveCount(0);
});
