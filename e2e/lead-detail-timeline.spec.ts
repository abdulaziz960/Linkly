import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("pressing a lead opens its details and a timeline of everything that happened", async ({ page }) => {
  test.setTimeout(180000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.setViewportSize({ width: 1280, height: 1900 });

  // A customer (and its conversation), moved New -> Interested -> Qualified and booked for a visit.
  const created = await page.request.post("/api/customers", { data: { name: "فهد التسلسل", phone: "0551234567" } });
  expect(created.ok(), await created.text()).toBe(true);
  const customer = (await created.json()) as { data: { id: string } };
  const conversationId = customer.data.id;
  for (const stage of ["مهتم", "مؤهل"]) {
    const moved = await page.request.put(`/api/conversations/${conversationId}/lead-status`, { data: { status: stage } });
    expect(moved.ok(), await moved.text()).toBe(true);
  }
  const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const booked = await page.request.post("/api/crm/visits", { data: { date: day, time: "17:00", customerName: "فهد التسلسل", customerPhone: "0551234567" } });
  expect(booked.ok(), await booked.text()).toBe(true);

  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "داخل المنصة" }).click();
  const card = page.locator(".pipeline-card", { hasText: "فهد التسلسل" });
  await expect(card).toBeVisible();
  await card.locator(".pipeline-card-top").click();

  const dialog = page.getByRole("dialog", { name: "تفاصيل العميل" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("فهد التسلسل");
  await expect(dialog.getByText("لم يحدد زيارة بعد")).toHaveCount(0); // the visit is there
  await expect(dialog).toContainText(day);

  await dialog.getByRole("tab", { name: "الخط الزمني" }).click();
  await expect(dialog.getByText("تم تحديث مرحلة العميل من").first()).toBeVisible();
  const stageLines = dialog.locator("li", { hasText: "تم تحديث مرحلة العميل من" });
  await expect(stageLines).toHaveCount(2);
  await expect(stageLines.first()).toContainText("مؤهل"); // newest first
  await expect(dialog.locator("li", { hasText: "حجز زيارة" })).toHaveCount(1);
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    { await page.waitForTimeout(500); await page.screenshot({ path: join(shots, "lead-timeline.png") }); }
  }
  await dialog.getByRole("tab", { name: /التفاعلات/ }).click();
  await dialog.getByRole("tab", { name: "السجل" }).click();
  await dialog.getByRole("tab", { name: "نظرة عامة" }).click();
  if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: join(shots, "lead-overview.png") }); }
  await dialog.getByRole("button", { name: "إغلاق" }).click();

  // --- stats: today's arrivals and the visit booked today
  await page.getByRole("tab", { name: "الإحصائيات" }).click();
  await expect(page.getByText("حددوا موعد زيارة").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "تقرير الزيارات" })).toBeVisible();
  await expect(page.getByText("اشتروا بعد الزيارة")).toBeVisible();
  await expect(page.getByText("لا توجد زيارات في هذه الفترة").first()).toBeVisible(); // the only visit is still ahead
  if (shots) { await page.waitForTimeout(500); await page.locator(".pipeline-view").screenshot({ path: join(shots, "lead-stats.png") }); }

  // Clean up the visit so the schedule spec starts empty.
  await page.getByRole("tab", { name: "المواعيد" }).click();
  await page.locator("article", { hasText: "فهد التسلسل" }).getByRole("button", { name: "حذف الموعد" }).click();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
});
