import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

test("an admin deletes a client that never paid, by retyping its name", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);

  const company = "شركة للحذف النهائي";
  const created = await page.request.post("/api/admin/clients", {
    data: { company, owner: "ليلى", ownerEmail: "to-delete@example.com", plan: "باقة اختبار المتصفح", status: "تجربة", renewal: "2026-12-02", amount: 0, billingCycle: "تجربة" }
  });
  expect(created.ok()).toBeTruthy();
  const tenantId = (await created.json()).data?.subscription?.tenantId;
  expect(tenantId).toBeTruthy();

  await page.goto(`/linkly-admin007/clients/${tenantId}`);
  await page.getByRole("button", { name: "حذف العميل" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("لا يمكن التراجع");
  const submit = confirm.getByRole("button", { name: "حذف نهائي" });
  await expect(submit).toBeDisabled();
  await confirm.getByRole("textbox").fill(company);
  if (shots) await page.screenshot({ path: `${shots}/client-delete-confirm.png` });
  await submit.click();

  await expect(page).toHaveURL(/linkly-admin007\/clients$/);
  await expect(page.getByText(company)).toHaveCount(0);
  const again = await page.request.get(`/api/admin/clients`);
  expect(JSON.stringify(await again.json())).not.toContain(company);
});
