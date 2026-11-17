import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

test("an admin sets a client's price and confirms a bank transfer, and it joins the payments", async ({ page }) => {
  test.setTimeout(150000);
  if (shots) mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);

  const created = await page.request.post("/api/admin/clients", {
    data: { company: "شركة التحويل البنكي", owner: "ليلى", ownerEmail: "bank-transfer@example.com", plan: "باقة اختبار المتصفح", status: "نشط", renewal: "2099-01-10", amount: 199, billingCycle: "شهري" }
  });
  expect(created.ok()).toBeTruthy();
  const tenantId = (await created.json()).data?.subscription?.tenantId;
  await page.goto(`/linkly-admin007/clients/${tenantId}`);

  // The price of the cycle can be edited with the cycle and the end date.
  await page.getByRole("button", { name: "تعديل الاشتراك" }).click();
  const edit = page.getByRole("dialog", { name: "تعديل الاشتراك" });
  await expect(edit.getByLabel(/سعر الدورة/)).toHaveValue("199");
  await edit.getByLabel(/سعر الدورة/).fill("249");
  // A price different from the plan's usual one is offered as this client's agreed price (on by default).
  await expect(edit.getByRole("checkbox", { name: /اعتماد هذا السعر سعرًا خاصًا/ })).toBeChecked();
  if (shots) await page.screenshot({ path: `${shots}/subscription-agreed-price.png` });
  await edit.getByRole("button", { name: "حفظ" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("249").first()).toBeVisible();

  // The agreed price is remembered for the client's plan and cycle.
  await page.getByRole("button", { name: "تعديل الاشتراك" }).click();
  await expect(page.getByText("سعر خاص مفعّل حاليًا: 249 ر.س (شهري)")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "تعديل الاشتراك" })).toBeHidden();

  // Confirm a bank transfer for a year.
  await page.getByRole("button", { name: "تأكيد دفعة" }).click();
  const dialog = page.getByRole("dialog", { name: "تأكيد دفعة الاشتراك" });
  await dialog.getByLabel("دورة الفوترة").selectOption("سنوي");
  await dialog.getByLabel(/قيمة الفاتورة للدورة/).fill("2000");
  await expect(dialog.getByText("2,300 ر.س")).toBeVisible(); // 2000 + 15% tax
  await dialog.getByLabel("رقم الحوالة أو مرجعها (اختياري)").fill("TR-9001");
  if (shots) await page.screenshot({ path: `${shots}/manual-payment-dialog.png` });
  await dialog.getByRole("button", { name: "تأكيد الدفع وتفعيل الاشتراك" }).click();
  await expect(dialog).toBeHidden();

  // The subscription is annual until a year after its old end date, and the payment is in the list as completed.
  await expect(page.getByText("الدورة: سنوي")).toBeVisible();
  await expect(page.getByText("2100-01-10").first()).toBeVisible();
  await page.goto(`/linkly-admin007/payments?client=${tenantId}`);
  await expect(page.getByText("2,300").first()).toBeVisible();
  await expect(page.getByText("منها ضريبة 300").first()).toBeVisible(); // 2300 total, 300 of it tax
  if (shots) await page.screenshot({ path: `${shots}/manual-payment-payments.png` });
});
