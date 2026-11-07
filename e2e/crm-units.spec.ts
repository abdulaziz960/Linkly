import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("units of a project: stock is set in the project, and a sale takes a unit automatically", async ({ page }) => {
  test.setTimeout(180000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.setViewportSize({ width: 1280, height: 1800 });
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });

  const unique = Date.now().toString(36);
  const projectName = `مشروع المخزون ${unique}`;
  const created = await page.request.post("/api/crm/projects", { data: { name: projectName, details: "فلل وشقق" } });
  expect(created.ok(), await created.text()).toBe(true);

  // --- add unit types in the project's dialog
  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "المشاريع" }).click();
  const card = page.locator("article", { hasText: projectName });
  await card.getByRole("button", { name: "تعديل" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل مشروع" });
  // A single unit is the default; a type with a count is one click away.
  await dialog.getByLabel("اسم الوحدة").fill("A1");
  await dialog.getByLabel("مساحة الوحدة").fill("270 م²");
  await dialog.getByLabel("سعر الوحدة").fill("950,000 ر.س");
  await dialog.getByLabel("وصف الوحدة", { exact: true }).fill("دور أرضي");
  await dialog.getByLabel("حالة الوحدة الجديدة").selectOption("reserved");
  await dialog.getByRole("button", { name: "إضافة وحدة", exact: true }).first().click();
  await expect(dialog.getByRole("combobox", { name: "حالة A1" })).toHaveValue("reserved");
  await expect(dialog.getByLabel("مساحة A1")).toHaveValue("270 م²");
  await dialog.getByRole("button", { name: "حذف A1" }).click();
  await expect(dialog.getByLabel("مساحة A1")).toHaveCount(0);
  await dialog.getByRole("button", { name: "نوع له عدد (مثل 5 فلل متشابهة)" }).click();
  await dialog.getByLabel("اسم نوع الوحدة").fill("فيلا بغرفتين");
  await dialog.getByLabel("العدد الكلي").fill("5");
  await dialog.getByLabel("العدد المتاح").fill("3");
  await dialog.getByRole("button", { name: "إضافة نوع وحدة" }).click();
  await expect(dialog.getByText("فيلا بغرفتين").first()).toBeVisible();
  // More available than the total is refused with a clear message.
  await dialog.getByLabel("اسم نوع الوحدة").fill("شقة");
  await dialog.getByLabel("العدد الكلي").fill("2");
  await dialog.getByLabel("العدد المتاح").fill("9");
  await dialog.getByRole("button", { name: "إضافة نوع وحدة" }).click();
  await expect(dialog.getByRole("alert")).toContainText("المتاح لا يتجاوز العدد الكلي");
  if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: join(shots, "units-editor.png") }); }
  await dialog.getByRole("button", { name: "إلغاء" }).click();
  await expect(card).toContainText("3");
  await expect(card).toContainText("وحدة متاحة من");

  // --- a customer linked to the unit type; moving to "sold" takes one, moving back returns it
  const customer = (await (await page.request.post("/api/customers", { data: { name: `عميل المخزون ${unique}`, phone: "0552223344" } })).json()) as { data: { id: string } };
  const projectsResponse = (await (await page.request.get("/api/crm/projects")).json()) as { data: { projects: Array<{ id: string; name: string }> } };
  const projectId = projectsResponse.data.projects.find((project) => project.name === projectName)!.id;
  const units = (await (await page.request.get(`/api/crm/projects/units?projectId=${projectId}`)).json()) as { data: { units: Array<{ id: string; available: number }> } };
  const unitId = units.data.units[0].id;
  expect((await page.request.put(`/api/crm/leads/${customer.data.id}/unit`, { data: { unitId } })).ok()).toBe(true);

  const available = async () => ((await (await page.request.get(`/api/crm/projects/units?projectId=${projectId}`)).json()) as { data: { units: Array<{ available: number }> } }).data.units[0].available;
  expect(await available()).toBe(3);
  expect((await page.request.put(`/api/conversations/${customer.data.id}/lead-status`, { data: { status: "فاز" } })).ok()).toBe(true);
  expect(await available()).toBe(2);

  // The customer's timeline says what happened.
  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "داخل المنصة" }).click();
  await page.locator(".pipeline-card", { hasText: `عميل المخزون ${unique}` }).locator(".pipeline-card-top").click();
  const detail = page.getByRole("dialog", { name: "تفاصيل العميل" });
  await expect(detail.getByText("الوحدة المهتم بها").first()).toBeVisible();
  await detail.getByRole("tab", { name: "الخط الزمني" }).click();
  await expect(detail.locator("li", { hasText: "بيعت وحدة «فيلا بغرفتين» (المتاح الآن 2)" })).toBeVisible();
  if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: join(shots, "units-timeline.png") }); }
  await detail.getByRole("button", { name: "إغلاق" }).click();

  expect((await page.request.put(`/api/conversations/${customer.data.id}/lead-status`, { data: { status: "مهتم" } })).ok()).toBe(true);
  expect(await available()).toBe(3);

  // Clean up.
  await page.request.delete("/api/crm/projects", { data: { id: projectId } });
});
