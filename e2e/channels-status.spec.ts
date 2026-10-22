import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("the channels page never shows a connected channel as 'Connect' while statuses load", async ({ page }) => {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  // Hold the overview answer for a moment, like a slow connection.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const overviewRequests: string[] = [];
  await page.route("**/api/settings/integration?channels=*", async (route) => {
    overviewRequests.push(route.request().url());
    await held;
    await route.continue();
  });

  await page.getByRole("navigation").getByRole("button", { name: "الإعدادات والربط", exact: true }).click();
  const whatsappCard = page.locator(".channel-connect-card", { hasText: "واتساب" }).first();
  await expect(whatsappCard.getByRole("button", { name: "جاري التحقق…" })).toBeDisabled();
  await expect(page.locator(".channel-connect-card button", { hasText: /^ربط$/ })).toHaveCount(0);

  release();
  await expect(whatsappCard.getByRole("button", { name: "متصل — إدارة" })).toBeVisible();
  // One request for every channel, not one per channel.
  expect(overviewRequests).toHaveLength(1);
  expect(new URL(overviewRequests[0]).searchParams.get("channels")?.split(",")).toEqual(expect.arrayContaining(["whatsapp", "instagram", "telegram"]));
});
