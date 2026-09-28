import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const widths = [320, 360, 375, 390, 430, 768, 1024];
const views = [
  ["inbox", "المحادثات"],
  ["contacts", "العملاء"],
  ["pipeline", "كانبان المبيعات"],
  ["campaigns", "الحملات"],
  ["automations", "الأتمتة"],
  ["bot", "الرد الآلي"],
  ["reports", "التقارير"],
  ["integrations", "التكاملات"],
  ["employees", "الموظفين والصلاحيات"]
] as const;

test("dashboard fits mobile viewports and its drawer remains usable", async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  const captureDir = process.env.MOBILE_CAPTURE_DIR;
  if (captureDir) mkdirSync(captureDir, { recursive: true });
  const findings: string[] = [];

  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : width === 375 ? 667 : width === 430 ? 932 : 800 });
    for (const [key, label] of views) {
      await page.locator(".mobile-topbar button").first().click();
      await expect(page.locator(".dashboard-sidebar")).toBeVisible();
      await page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
      await expect(page.locator(".dashboard-shell")).not.toHaveClass(/menu-open/);
      if (key === "bot" && width <= 720) {
        await expect(page.locator(".bot-step-library")).toBeVisible();
        await page.getByRole("tab", { name: "المخطط" }).click();
        await expect(page.locator(".bot-canvas")).toBeVisible();
      } else if (key === "bot") {
        await expect(page.locator(".bot-canvas")).toBeVisible();
      }
      const metrics = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>(".dashboard-main");
        const stack = document.querySelector<HTMLElement>(".page-stack");
        const outside = [...(main?.querySelectorAll<HTMLElement>("button, input, textarea, select, .panel, .page-hero, .bot-canvas, .bot-step-library") || [])]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || (rect.left >= -1 && rect.right <= innerWidth + 1)) return false;
            let parent = element.parentElement;
            while (parent && parent !== main) {
              const overflow = getComputedStyle(parent).overflowX;
              if ((overflow === "auto" || overflow === "scroll") && parent.scrollWidth > parent.clientWidth + 1) return false;
              parent = parent.parentElement;
            }
            return true;
          })
          .slice(0, 5)
          .map((element) => `${element.tagName.toLowerCase()}.${element.className}: ${Math.round(element.getBoundingClientRect().left)}..${Math.round(element.getBoundingClientRect().right)}`);
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          main: main ? { client: main.clientWidth, scroll: main.scrollWidth } : null,
          stack: stack ? { client: stack.clientWidth, scroll: stack.scrollWidth } : null,
          outside
        };
      });
      if (metrics.document > metrics.viewport + 1 || (metrics.main && metrics.main.scroll > metrics.main.client + 1) || (metrics.stack && metrics.stack.scroll > metrics.stack.client + 1) || metrics.outside.length) {
        findings.push(`${width}px ${key}: ${JSON.stringify(metrics)}`);
      }
      if (captureDir && ((width === 320 && key === "bot") || (width === 390 && ["inbox", "pipeline", "bot"].includes(key)))) {
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(captureDir, `${width}-${key}.png`), fullPage: true });
      }
    }
  }

  await page.setViewportSize({ width: 320, height: 568 });
  const menuButton = page.locator(".mobile-topbar button").first();
  await menuButton.click();
  await expect(page.locator(".dashboard-sidebar")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(page.getByRole("button", { name: "إغلاق القائمة" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dashboard-sidebar")).toBeHidden();
  await expect(menuButton).toBeFocused();

  await menuButton.click();
  await page.getByRole("navigation").getByRole("button", { name: "العملاء", exact: true }).click();
  await page.getByRole("button", { name: "إضافة عميل", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "حفظ عميل" })).toBeVisible();
  await page.getByRole("dialog", { name: "حفظ عميل" }).getByRole("textbox", { name: "اسم العميل" }).fill("عميل اختبار الجوال");
  await page.getByRole("dialog", { name: "حفظ عميل" }).getByRole("textbox", { name: "رقم الجوال" }).fill("+966501234567");
  await page.getByRole("dialog", { name: "حفظ عميل" }).getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator(".mobile-card-table")).toContainText("عميل اختبار الجوال");
  await expect(page.locator(".mobile-card-table")).toHaveJSProperty("scrollWidth", await page.locator(".mobile-card-table").evaluate((element) => element.clientWidth));
  if (captureDir) await page.screenshot({ path: join(captureDir, "320-contact-card.png"), fullPage: true });

  await menuButton.click();
  await page.getByRole("navigation").getByRole("button", { name: "الرد الآلي", exact: true }).click();
  await page.getByRole("button", { name: "إضافة رسالة ترحيب" }).click();
  await expect(page.getByRole("tab", { name: "المخطط" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".bot-mobile-node-list")).toContainText("الترحيب");
  await page.locator(".bot-mobile-node-list button").first().click();
  await expect(page.getByRole("dialog", { name: "إدارة خطوات الرد الآلي" })).toBeVisible();
  await expect(page.getByRole("button", { name: "نقل لليسار" })).toBeVisible();
  if (captureDir) await page.screenshot({ path: join(captureDir, "320-bot-editor.png"), fullPage: true });
  await page.getByRole("dialog", { name: "إدارة خطوات الرد الآلي" }).getByRole("button", { name: "إغلاق", exact: true }).first().click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".mobile-topbar")).toBeHidden();
  if (captureDir) await page.screenshot({ path: join(captureDir, "1440-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
  expect(findings, findings.join("\n")).toEqual([]);
});
