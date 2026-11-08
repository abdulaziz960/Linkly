import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("support can disable and re-enable a client's user from the client file", async ({ page }) => {
  test.setTimeout(180000);
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1300, height: 1400 });
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);

  const unique = Date.now().toString(36);
  const ownerEmail = `owner-${unique}@example.com`;
  const created = await page.request.post("/api/admin/clients", {
    data: { company: `شركة المستخدمين ${unique}`, owner: "سارة", ownerEmail, plan: "باقة اختبار المتصفح", status: "نشط", renewal: "2026-12-02", amount: 199, billingCycle: "شهري" }
  });
  expect(created.ok(), await created.text()).toBe(true);
  const tenantId = (await created.json()).data?.subscription?.tenantId;

  await page.goto(`/linkly-admin007/clients/${tenantId}`);
  await page.getByRole("tab", { name: /المستخدمون/ }).click();
  const row = page.locator("li", { hasText: ownerEmail });
  await expect(row.getByRole("button", { name: "تعطيل", exact: true })).toBeVisible();
  await expect(row.getByText("معطّل")).toHaveCount(0);
  // The owner can be disabled and re-enabled, but never removed.
  await expect(row.getByRole("button", { name: /^إزالة/ })).toHaveCount(0);

  // Disable: the row says so and the button turns into "تفعيل".
  await row.getByRole("button", { name: "تعطيل", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تعطيل الحساب" }).click();
  await expect(row.getByText("معطّل")).toBeVisible();
  if (shots) { await page.waitForTimeout(400); await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, "admin-employee-disabled.png") }); }

  // The state is real, not a client-side flag: it survives a reload.
  await page.reload();
  await page.getByRole("tab", { name: /المستخدمون/ }).click();
  await expect(row.getByText("معطّل")).toBeVisible();

  // Re-enable with one click.
  await row.getByRole("button", { name: "تفعيل", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تفعيل الحساب" }).click();
  await expect(row.getByText("معطّل")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "تعطيل", exact: true })).toBeVisible();
  if (shots) { await page.waitForTimeout(400); await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, "admin-employee-enabled.png") }); }
});
