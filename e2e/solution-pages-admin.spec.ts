import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

test("an admin adds a solution page and it shows on the site, in the sitemap and in the guide lists", async ({ page }) => {
  test.setTimeout(180000);
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

  await page.goto("/linkly-admin007/solutions");
  // The built-in guides are copied in and listed.
  await expect(page.getByText("إدارة واتساب لفريق خدمة العملاء من صندوق واحد")).toBeVisible();
  await expect(page.getByText("/solutions/clinics-whatsapp-inbox")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/solutions-admin-list.png`, fullPage: true });

  await page.getByRole("button", { name: "صفحة جديدة" }).first().click();
  const dialog = page.getByRole("dialog", { name: "صفحة حل جديدة" });
  await dialog.getByLabel(/الرابط المختصر/).fill("pharmacy-orders");
  await dialog.getByLabel(/العنوان \(عربي\)/).fill("واتساب للصيدليات: طلبات الوصفات والتوصيل");
  await dialog.getByLabel(/وصف مختصر/).fill("كيف تستقبل صيدليتك الطلبات على واتساب وتوزعها على فريق الصرف والتوصيل.");
  await dialog.locator("#solution-body-ar").fill("## استقبال الطلبات\nيصل الطلب إلى صندوق واحد ويُسند لموظف الصرف.\n\n## المتابعة\nراجع ");
  await dialog.getByRole("button", { name: "إضافة رابط داخلي" }).click();
  await dialog.getByLabel("نص الرابط", { exact: true }).fill("الأسعار");
  await dialog.locator("input[list]").fill("/pricing");
  await dialog.getByRole("button", { name: "إدراج" }).click();
  await expect(dialog.locator("#solution-body-ar")).toHaveValue(/\[الأسعار\]\(\/pricing\)$/);
  // Moving straight on to the next field must not pull the cursor back into the text.
  await dialog.getByLabel(/قائمة «قبل أن تبدأ»/).fill("رقم واتساب للصيدلية\nساعات العمل");
  await expect(dialog.locator("#solution-body-ar")).not.toHaveValue(/ساعات العمل/);
  if (shots) await page.screenshot({ path: `${shots}/solutions-admin-form.png` });
  await dialog.getByRole("button", { name: "حفظ" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("/solutions/pharmacy-orders")).toBeVisible();

  // The public pages keep the guides in memory for up to 30 seconds.
  await expect(async () => {
    await page.goto("/solutions/pharmacy-orders");
    await expect(page.locator("h1")).toHaveText("واتساب للصيدليات: طلبات الوصفات والتوصيل", { timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
  await expect(page.locator("h2", { hasText: "استقبال الطلبات" })).toBeVisible();
  await expect(page.locator("section a[href='/pricing']")).toHaveText("الأسعار");
  await expect(page.locator("li", { hasText: "ساعات العمل" })).toBeVisible();
  // No English version was written, so there is no English page and no language switch.
  await expect(page.getByRole("link", { name: "English" })).toHaveCount(0);
  expect((await page.request.get("/en/solutions/pharmacy-orders")).status()).toBe(404);
  if (shots) await page.screenshot({ path: `${shots}/solutions-public-page.png`, fullPage: true });

  // In the sitemap, and in the guide list of the home page.
  expect(await (await page.request.get("/sitemap.xml")).text()).toContain("https://linklysa.io/solutions/pharmacy-orders");
  await page.goto("/");
  await expect(page.locator("#guides a[href='/solutions/pharmacy-orders']")).toBeVisible();
  // And the page-SEO screen offers it.
  await page.goto("/linkly-admin007/page-seo");
  await expect(page.getByText("حلول: واتساب للصيدليات: طلبات الوصفات والتوصيل (عربي)")).toBeVisible();
});
