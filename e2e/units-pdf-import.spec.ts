import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

// What the AI would read out of the developer's sheet (A1..A10 shortened): each unit with its own state.
const sheetUnits = [
  { name: "A1", kind: "دور أرضي", model: "A", area: "270 م²", priceText: "950,000 ر.س", status: "available" },
  { name: "A2", kind: "بنت هاوس", model: "A", area: "395.08 م²", priceText: "1,080,000 ر.س", status: "available" },
  { name: "A9", kind: "دور أرضي", model: "A", area: "270 م²", priceText: "", status: "reserved" },
  { name: "B9", kind: "تاون هاوس", model: "B", area: "347.03 م²", priceText: "فيلا العرض", status: "available" },
  { name: "C4", kind: "فيلا", model: "C", area: "487.72 م²", priceText: "", status: "sold" }
];

test("a price sheet PDF is read, reviewed unit by unit, and saved as one row per unit with its status", async ({ page }) => {
  test.setTimeout(180000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.setViewportSize({ width: 1280, height: 2000 });
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });

  const projectName = `خام 19 ${Date.now().toString(36)}`;
  expect((await page.request.post("/api/crm/projects", { data: { name: projectName, details: "حي المرجان" } })).ok()).toBe(true);

  // The AI provider is not reachable from the test: reading the PDF is answered as if the model had read the sheet.
  let uploaded = "";
  await page.route("**/api/crm/projects/units/parse", async (route) => {
    uploaded = route.request().headers()["content-type"] ?? "";
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { units: sheetUnits } }) });
  });

  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "المشاريع" }).click();
  await page.locator("article", { hasText: projectName }).getByRole("button", { name: "تعديل" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل مشروع" });
  await dialog.getByLabel("ملف الأسعار PDF").setInputFiles({ name: "prices.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 sample") });

  // Review: every unit with its own status, the counts in one line, and a wrong row can be removed.
  await expect(dialog.getByText("وجدت 5 وحدة: 3 متاح، 1 محجوز، 1 مباعة")).toBeVisible();
  expect(uploaded).toContain("multipart/form-data");
  await expect(dialog.getByRole("cell", { name: "B9", exact: true })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "فيلا العرض" })).toBeVisible();
  if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: join(shots, "units-pdf-review.png") }); }
  await dialog.getByRole("button", { name: "حذف الصف B9" }).click();
  await expect(dialog.getByText("وجدت 4 وحدة: 2 متاح، 1 محجوز، 1 مباعة")).toBeVisible();

  // Nothing is saved before the confirmation.
  const projectId = ((await (await page.request.get("/api/crm/projects")).json()) as { data: { projects: Array<{ id: string; name: string }> } }).data.projects.find((project) => project.name === projectName)!.id;
  const saved = async () => ((await (await page.request.get(`/api/crm/projects/units?projectId=${projectId}`)).json()) as { data: { units: Array<{ name: string; kind: string; model: string; total: number; available: number; reserved: number }> } }).data.units;
  expect(await saved()).toHaveLength(0);

  await dialog.getByRole("button", { name: "استيراد 4 وحدة" }).click();
  await expect(dialog.getByText("تم الاستيراد: أُضيفت 4 وحدة وحُدّثت 0.")).toBeVisible();
  const units = await saved();
  expect(units.map((unit) => [unit.name, unit.total, unit.available, unit.reserved])).toEqual([["A1", 1, 1, 0], ["A2", 1, 1, 0], ["A9", 1, 0, 1], ["C4", 1, 0, 0]]);
  expect(units[0]).toMatchObject({ kind: "دور أرضي", model: "A" });

  // Each unit shows its own status and can be changed on the spot.
  await expect(dialog.getByLabel("حالة A9")).toHaveValue("reserved");
  await expect(dialog.getByLabel("حالة C4")).toHaveValue("sold");
  await dialog.getByLabel("حالة A9").selectOption("available");
  await expect.poll(async () => (await saved()).find((unit) => unit.name === "A9")?.available).toBe(1);
  if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: join(shots, "units-pdf-saved.png") }); }

  // Importing the same sheet again updates by name instead of duplicating.
  await dialog.getByLabel("ملف الأسعار PDF").setInputFiles({ name: "prices.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 sample") });
  await dialog.getByRole("button", { name: "استيراد 5 وحدة" }).click();
  await expect(dialog.getByText("تم الاستيراد: أُضيفت 1 وحدة وحُدّثت 4.")).toBeVisible();
  expect(await saved()).toHaveLength(5);
});

test("reading the PDF explains why when it cannot", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.setViewportSize({ width: 1280, height: 1800 });
  const projectName = `مشروع بلا مفتاح ${Date.now().toString(36)}`;
  expect((await page.request.post("/api/crm/projects", { data: { name: projectName, details: "x" } })).ok()).toBe(true);

  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "المشاريع" }).click();
  await page.locator("article", { hasText: projectName }).getByRole("button", { name: "تعديل" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل مشروع" });
  // The real endpoint with a fake PDF: whatever the workspace's AI setup (other specs may add a key), the reason is shown, never a silent failure.
  await dialog.getByLabel("ملف الأسعار PDF").setInputFiles({ name: "prices.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 sample") });
  await expect(dialog.getByRole("status").filter({ hasText: /\S{6,}/ }).first()).toBeVisible({ timeout: 60000 });
  await expect(dialog.getByRole("button", { name: /^استيراد \d+ وحدة$/ })).toHaveCount(0);
});
