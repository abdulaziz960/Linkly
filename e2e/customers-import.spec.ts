import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

const CSV = [
  "الاسم الأول,اسم العائلة,العميل المحتمل Name,البريد الإلكتروني,هاتف,الهاتف المحمول,مصدر العميل المحتمل,حالة العميل المحتمل,اسم المشروع",
  ",,عميل مستورد أول,a@example.com,,+966 53 777 0101,Zoho CRM,غير مهتم,خام 19",
  ",,عميل مستورد ثاني,,+966561770102,,Zoho CRM,مهتم,خام 18",
  ",,عميل مستورد مكرر,,,0537770101,Zoho CRM,جديد,خام 19",
  ",,بدون رقم,,,,Zoho CRM,جديد,خام 19"
].join("\n");

test("a leads file is imported into Customers and the pipeline without opening conversations", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const shots = process.env.IMPORT_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });

  await page.goto("/dashboard?view=contacts");
  await page.getByRole("button", { name: "استيراد عملاء" }).click();
  const dialog = page.getByRole("dialog", { name: "استيراد عملاء من ملف" });
  await dialog.getByTestId("import-file").setInputFiles({ name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  const preview = dialog.getByTestId("import-preview");
  await expect(preview).toContainText("2");
  await expect(preview).toContainText("مكرر");
  await expect(preview).toContainText("بدون رقم صالح");
  // The "lost" stage reads "غير مهتم" here like everywhere else in the app.
  await expect(preview.getByRole("combobox").first()).toHaveValue("خسر");
  await expect(preview.getByRole("combobox").first().locator("option:checked")).toHaveText("غير مهتم");
  if (shots) await page.screenshot({ path: `${shots}/1-preview.png` });
  await dialog.getByTestId("import-confirm").click();
  await expect(dialog.getByTestId("import-done")).toContainText("2");
  await expect(dialog).toContainText("لم تُرسل أي رسالة");
  if (shots) await page.screenshot({ path: `${shots}/2-done.png` });
  await dialog.getByRole("button", { name: "إغلاق", exact: true }).last().click();

  await page.getByPlaceholder(/بحث باسم العميل/).fill("عميل مستورد أول");
  await expect(page.locator("table")).toContainText("عميل مستورد أول");
  if (shots) await page.screenshot({ path: `${shots}/3-customers.png` });

  // The leads board shows them in the stage the file said.
  const conversations = await (await page.request.get("/api/conversations")).json();
  const body = JSON.stringify(conversations);
  expect(body).toContain("عميل مستورد أول");
  expect(body).toMatch(/عميل مستورد أول[^]*?"pipelineStage":"خسر"|"pipelineStage":"خسر"[^]*?عميل مستورد أول/);
  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "داخل المنصة" }).click();
  await expect(page.locator(".pipeline-view")).toContainText("عميل مستورد ثاني");
  await expect(page.locator(".pipeline-view")).toContainText("عميل مستورد أول");
  if (shots) await page.screenshot({ path: `${shots}/4-pipeline.png` });
});
