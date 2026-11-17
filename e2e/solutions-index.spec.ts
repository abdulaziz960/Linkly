import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

async function declineCookies(page: Page) {
  const notice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await notice.isVisible().catch(() => false)) await notice.getByRole("button", { name: "رفض", exact: true }).click();
}

test("the public site links to the solutions: header, index page of cards, breadcrumb on a guide", async ({ page }) => {
  test.setTimeout(120000);
  if (shots) mkdirSync(shots, { recursive: true });
  await skipPwaInstallPopup(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await declineCookies(page);

  const header = page.getByRole("navigation", { name: "التنقل الرئيسي" });
  await expect(header.getByRole("link", { name: "الحلول" })).toBeVisible();
  await expect(header.getByRole("link", { name: "المدونة" })).toHaveAttribute("href", "/blog"); // its own page, one click from the header
  if (shots) await page.screenshot({ path: `${shots}/public-header-solutions.png`, clip: { x: 0, y: 0, width: 1280, height: 110 } });
  await header.getByRole("link", { name: "الحلول" }).click();
  await expect(page).toHaveURL(/\/solutions$/);
  await declineCookies(page);

  await expect(page.locator("h1")).toHaveText("حلول لنكلي");
  // The seven built-in guides, plus any another spec added to the shared test database.
  const cards = page.locator("nav.solution-links a");
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(7);
  await expect(cards.first().locator("strong")).not.toBeEmpty();
  if (shots) await page.screenshot({ path: `${shots}/solutions-index-desktop.png`, fullPage: true });

  await cards.first().click();
  await expect(page).toHaveURL(/\/solutions\/[a-z-]+$/);
  await expect(page.locator("nav.crumbs").getByRole("link", { name: "الحلول" })).toBeVisible();
  await expect(page.locator("nav.solution-links a")).toHaveCount(total - 1); // the other guides, not the one being read
  if (shots) await page.screenshot({ path: `${shots}/solution-guide-breadcrumb.png`, clip: { x: 0, y: 0, width: 1280, height: 520 } });

  // English, and the mobile menu.
  await page.goto("/en");
  await declineCookies(page);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Solutions" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/en/blog");
  await page.goto("/en/solutions");
  await expect(page.locator("h1")).toHaveText("Linkly solutions");
  await expect(page.locator("nav.solution-links a").first()).toBeVisible();
  expect(await page.locator("nav.solution-links a").count()).toBeGreaterThanOrEqual(7);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await declineCookies(page);
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await expect(page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link", { name: "الحلول" })).toBeVisible();
  if (shots) {
    await page.waitForTimeout(700); // the menu fades in
    await page.screenshot({ path: `${shots}/public-menu-mobile.png` });
  }
});
