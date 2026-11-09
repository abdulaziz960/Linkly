import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

// Runs only with projects switched on: E2E_WORKSPACES=1 npx playwright test e2e/workspace-hero-menu.spec.ts
test.skip(process.env.E2E_WORKSPACES !== "1", "needs E2E_WORKSPACES=1");

test("the project menu inside a page banner is shown whole on every banner style", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const n = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await n.isVisible()) await n.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const late = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  await late.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await late.isVisible()) await late.getByRole("button", { name: "رفض", exact: true }).click();
  const switcher = page.locator(".dashboard-sidebar .ws-switcher-btn");
  await switcher.click();
  await page.getByRole("button", { name: /مساحة عمل جديدة/ }).click();
  const dialog = page.getByRole("dialog", { name: "مساحة عمل جديدة" });
  await dialog.getByLabel("اسم مساحة العمل").fill("مشروع ثاني");
  await dialog.getByRole("button", { name: "إنشاء مساحة العمل" }).click();
  await expect(dialog).toBeHidden();
  for (const [label, shot] of [["الحملات والعروض البريدية", "campaigns"], ["التقارير", "reports"], ["العملاء والعملاء المحتملون والوسوم", "contacts"], ["المحادثات", "inbox"]] as const) {
    await page.locator(".dashboard-sidebar").getByText(label).first().click({ timeout: 5000 }).catch(() => undefined);
    const pill = page.locator(".ws-hero-pill").first();
    if (!(await pill.isVisible().catch(() => false))) { continue; }
    await pill.locator("> button").click();
    const menu = pill.locator(".ws-menu");
    await expect(menu).toBeVisible();
    const last = menu.locator("button").last();
    const box = (await last.boundingBox())!;
    const topEl = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".ws-menu") !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    if (process.env.HERO_SHOTS) await page.screenshot({ path: `reports/hero-menu-${shot}.png`, clip: { x: 0, y: 0, width: 1440, height: 420 } });
    expect(topEl, `the last project in the menu is covered or clipped on "${label}"`).toBe(true);
    await page.keyboard.press("Escape");
  }
});
