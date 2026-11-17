import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";
// An 8x6 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEklEQVR4nGP4z8CAFWEXpZMEADMoL9HswQX5AAAAAElFTkSuQmCC", "base64");

test("an author adds an internal link and a picture from the editor buttons, and both show in the article", async ({ page }) => {
  test.setTimeout(150000);
  if (shots) mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);

  await page.goto("/linkly-admin007/blog");
  await page.getByRole("button", { name: "مقال جديد" }).first().click();
  const dialog = page.getByRole("dialog", { name: "مقال جديد" });
  await dialog.getByLabel("الرابط المختصر (slug)").fill("body-tools-check");
  await dialog.getByLabel("العنوان (عربي)").fill("مقال تجربة أدوات المتن");
  const body = dialog.locator("#blog-body-ar");
  await body.fill("اقرأ عن ");

  // Internal link: the words typed so far stay, the link goes at the cursor.
  await dialog.getByRole("button", { name: "إضافة رابط داخلي" }).click();
  await dialog.getByLabel("نص الرابط", { exact: true }).fill("الأسعار");
  await dialog.locator("input[list]").fill("/pricing");
  await dialog.getByRole("button", { name: "إدراج" }).click();
  await expect(body).toHaveValue("اقرأ عن [الأسعار](/pricing)");

  // Picture: needs the alt text, then lands on a line of its own with its size.
  await dialog.getByRole("button", { name: "إضافة صورة" }).click();
  await dialog.locator('input[type="file"]').first().setInputFiles({ name: "pic.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByText(/تم التحويل إلى WebP/)).toBeVisible();
  await dialog.getByRole("button", { name: "إدراج" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "النص البديل" })).toBeVisible();
  await dialog.getByLabel("النص البديل (Alt) — يصف الصورة").fill("لقطة تجريبية");
  if (shots) await page.screenshot({ path: `${shots}/blog-body-tools.png` });
  await dialog.getByRole("button", { name: "إدراج" }).click();
  await expect(body).toHaveValue(/\[الأسعار\]\(\/pricing\)\n\n!\[لقطة تجريبية\]\(\/media\/[^)]+ "8x6"\)$/);

  await dialog.getByRole("button", { name: "حفظ" }).click();
  await expect(dialog).toBeHidden();

  // The public pages keep the posts in memory for up to 30 seconds.
  await expect(async () => {
    await page.goto("/blog/body-tools-check");
    await expect(page.locator("article.article-body a[href='/pricing']")).toHaveText("الأسعار", { timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
  const figure = page.locator("article.article-body figure img");
  await expect(figure).toHaveAttribute("alt", "لقطة تجريبية");
  await expect(figure).toHaveAttribute("src", /^\/media\//);
  await expect(figure).toHaveAttribute("width", "8");
  await expect(figure).toHaveAttribute("loading", "lazy");
  if (shots) await page.screenshot({ path: `${shots}/blog-body-article.png` });
});
