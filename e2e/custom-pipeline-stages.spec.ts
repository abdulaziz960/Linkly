import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("the owner adds a custom stage that shows on the board and in the ad-event mapping", async ({ page }) => {
  test.setTimeout(180000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "داخل المنصة" }).click();
  await page.getByRole("button", { name: "إدارة المراحل" }).click();
  const dialog = page.getByRole("dialog", { name: "إدارة المراحل" });
  await dialog.getByLabel("اسم المرحلة الجديدة").fill("حضر الاجتماع");
  await dialog.getByRole("button", { name: "إضافة" }).click();
  await expect(dialog.locator("li", { hasText: "حضر الاجتماع" })).toBeVisible();
  // A built-in stage name is refused with a clear message.
  const nameInput = dialog.getByLabel("اسم المرحلة الجديدة");
  await expect(nameInput).toHaveValue("");
  await nameInput.fill("مؤهل");
  await expect(nameInput).toHaveValue("مؤهل");
  await dialog.getByRole("button", { name: "إضافة" }).click();
  await expect(dialog.getByRole("alert")).toContainText("مرحلة أساسية");
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, "custom-stage-dialog.png") });
  }
  await dialog.getByRole("button", { name: "تم", exact: true }).click();
  await expect(page.locator(".pipeline-column-head", { hasText: "حضر الاجتماع" })).toBeVisible();

  // The same stage is available for the Snapchat event mapping.
  await page.goto("/dashboard?view=integrations");
  await page.locator(".meta-test-card", { hasText: "سناب شات" }).getByRole("button", { name: "إعداد" }).click();
  await page.getByRole("tab", { name: "ربط الأحداث" }).click();
  await expect(page.getByText("حضر الاجتماع", { exact: true })).toBeVisible();

  // Meta and TikTok use the same event picker: standard events with explanations + a custom option.
  for (const platform of ["ميتا", "تيك توك"]) {
    await page.goto("/dashboard?view=integrations");
    await page.locator(".meta-test-card", { hasText: platform }).getByRole("button", { name: "إعداد" }).click();
    await page.getByRole("tab", { name: "ربط الأحداث" }).click();
    await expect(page.getByText("حضر الاجتماع", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "جديد", exact: true }).click();
    await expect(page.getByRole("option", { name: /Lead — / }).first()).toBeVisible();
    await page.getByRole("option", { name: /حدث مخصص/ }).first().click();
    const custom = page.getByLabel("جديد custom");
    await custom.fill("My Event!");
    await expect(custom).toHaveValue(platform === "ميتا" ? "MyEvent" : "My Event");
    if (shots) await page.screenshot({ path: join(shots, platform === "ميتا" ? "meta-events.png" : "tiktok-events.png") });
  }

  // Clean up so other specs see the default pipeline.
  await page.goto("/dashboard?view=pipeline");
  await page.getByRole("tab", { name: "داخل المنصة" }).click();
  await page.getByRole("button", { name: "إدارة المراحل" }).click();
  await page.getByRole("dialog", { name: "إدارة المراحل" }).getByRole("button", { name: "حذف حضر الاجتماع" }).click();
  await expect(page.getByRole("dialog", { name: "إدارة المراحل" }).locator("li", { hasText: "حضر الاجتماع" })).toHaveCount(0);
});
