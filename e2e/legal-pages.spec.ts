import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";
const PAGES = [
  ["privacy", "ar", "/privacy"], ["terms", "ar", "/terms"], ["data-deletion", "ar", "/data-deletion"],
  ["privacy", "en", "/en/privacy"], ["terms", "en", "/en/terms"], ["data-deletion", "en", "/en/data-deletion"],
  ["contact", "ar", "/contact"], ["contact", "en", "/en/contact"]
] as const;

async function pageText(page: Page) {
  const section = page.locator("section.legal-shell");
  const all = await section.innerText();
  const nav = await section.locator("nav.legal-links").innerText();
  return all.replace(nav, "").replace(/\s+/g, " ").trim();
}

async function signInAsAdmin(page: Page) {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);
}

test("the legal pages read exactly as they did when they were written in code, and keep their footer links and structured data", async ({ page }) => {
  test.setTimeout(120000);
  for (const [slug, lang, path] of PAGES) {
    await page.goto(path);
    const fixture = readFileSync(join(process.cwd(), "tests", "fixtures", "legal", `${slug}-${lang}.txt`), "utf-8").replace(/\s+/g, " ").trim();
    // The contact page's two buttons sit side by side with no space between them in the old page: compare it without spaces.
    const squash = (text: string) => (slug === "contact" ? text.replace(/\s+/g, "") : text);
    expect(squash(await pageText(page)), path).toBe(squash(fixture));
    // The links under the page, and the page's own structured data (page + breadcrumb).
    await expect(page.locator("nav.legal-links a").first()).toBeVisible();
    const graph = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(graph["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual([slug === "contact" ? "ContactPage" : "WebPage", "BreadcrumbList"]);
  }
  await page.goto("/privacy");
  await expect(page.locator("nav.legal-links").getByRole("button", { name: "إعدادات الكوكيز" })).toBeVisible();
});

test("an admin edits a legal page, sees it on the site, and puts it back", async ({ page }) => {
  test.setTimeout(180000);
  if (shots) mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsAdmin(page);
  await page.goto("/linkly-admin007/legal-pages");
  await expect(page.getByText("شروط الاستخدام").first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/legal-admin-list.png` });

  await page.getByRole("row", { name: /شروط الاستخدام/ }).getByRole("button", { name: "تعديل" }).click();
  const dialog = page.getByRole("dialog", { name: /تعديل — شروط الاستخدام/ });
  const body = dialog.locator("#legal-body-ar");
  await expect(body).toHaveValue(/## /);
  await body.fill(`${await body.inputValue()}\n\n## بند أضافه الأدمن\nنص تجريبي للبند الجديد.`);
  if (shots) await page.screenshot({ path: `${shots}/legal-admin-edit.png` });
  await dialog.getByRole("button", { name: "حفظ" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: /شروط الاستخدام/ }).getByText("معدَّلة")).toBeVisible();

  // The public pages keep the text in memory for up to 30 seconds.
  await expect(async () => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "بند أضافه الأدمن" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
  await expect(page.getByText("نص تجريبي للبند الجديد.")).toBeVisible();

  // Back to the original text.
  await page.goto("/linkly-admin007/legal-pages");
  await page.getByRole("row", { name: /شروط الاستخدام/ }).getByRole("button", { name: "إرجاع للأصل" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "إرجاع", exact: true }).click();
  await expect(async () => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "بند أضافه الأدمن" })).toHaveCount(0, { timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
});
