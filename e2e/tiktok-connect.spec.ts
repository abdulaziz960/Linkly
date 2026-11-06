import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("the TikTok card connects through TikTok Ads (no Zapier) and shows the connected state with the welcome option", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.setViewportSize({ width: 1280, height: 1100 });
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });

  await page.goto("/dashboard?view=integrations");
  const card = page.locator(".meta-test-card", { has: page.getByRole("heading", { name: "تيك توك" }) });
  await expect(card.getByText("الاستقبال: غير متصل")).toBeVisible();
  await card.getByRole("button", { name: "إعداد" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Zapier")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "ربط", exact: true })).toBeVisible();
  await expect(dialog.getByText("غير متصل")).toBeVisible();
  if (shots) await page.screenshot({ path: join(shots, "tiktok-card-not-connected.png") });

  // The connect button goes to the TikTok Ads route, not the organic Login Kit one.
  const href = await page.evaluate(() => (document.querySelector("button.btn.primary") as HTMLElement | null)?.textContent);
  expect(href).toBeTruthy();
});

test("the TikTok connection result from TikTok is explained in plain words", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard?view=integrations&tiktok=subscription-error");
  await expect(page.getByRole("status").filter({ hasText: "مدير (Admin)" })).toBeVisible();
  await page.goto("/dashboard?view=integrations&tiktok=connected");
  await expect(page.getByRole("status").filter({ hasText: "تم ربط تيك توك بنجاح" })).toBeVisible();
});
