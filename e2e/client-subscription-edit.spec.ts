import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

test("an admin sets a client's billing cycle and renewal date by hand", async ({ page }) => {
  test.setTimeout(120000);
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
    data: { company: "شركة الاشتراك اليدوي", owner: "سارة", ownerEmail: "manual-sub@example.com", plan: "باقة اختبار المتصفح", status: "نشط", renewal: "2026-12-02", amount: 199, billingCycle: "شهري" }
  });
  expect(created.ok()).toBeTruthy();
  const tenantId = (await created.json()).data?.subscription?.tenantId;
  expect(tenantId).toBeTruthy();

  await page.goto(`/linkly-admin007/clients/${tenantId}`);
  await expect(page.getByText("الدورة: شهري")).toBeVisible();
  await page.getByRole("button", { name: "تعديل الاشتراك" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل الاشتراك" });
  await dialog.getByLabel("دورة الفوترة").selectOption("سنوي");
  await dialog.getByRole("button", { name: "+ سنة" }).click();
  await expect(dialog.getByLabel("تاريخ التجديد (نهاية الاشتراك)")).toHaveValue("2027-12-02");
  if (shots) await page.screenshot({ path: `${shots}/subscription-editor.png` });
  await dialog.getByRole("button", { name: "حفظ" }).click();

  await expect(page.getByText("الدورة: سنوي")).toBeVisible();
  await expect(page.getByText("إجمالي الفاتورة السنوية")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/subscription-after.png` });

  // The clients list shows the same invoice: yearly for an annual client.
  await page.goto("/linkly-admin007/clients");
  const row = page.getByRole("row", { name: /شركة الاشتراك اليدوي/ });
  await expect(row).toContainText("سنوية");
  if (shots) await page.screenshot({ path: `${shots}/clients-list.png` });
});
