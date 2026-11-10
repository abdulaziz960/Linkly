import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

// Sending to WhatsApp cannot succeed in the test deployment, so the bubble is built with the app's own classes
// and markup inside the real dashboard, and the styles are checked on it.
test("the quoted message inside our own reply bubble stays readable (dark text on its light box)", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.evaluate(() => {
    const host = document.querySelector(".dashboard-main") as HTMLElement;
    const wrap = document.createElement("div");
    wrap.id = "quote-probe";
    wrap.style.cssText = "position:fixed;top:120px;left:120px;width:420px;z-index:9999";
    wrap.innerHTML = '<article class="message-bubble out"><span class="message-reply-preview"><b>رد على مهند بن عبدالله</b><span>أنا ودي تشوفون الحسابات وتحللونها</span></span><span>اكيد لا توصي حريص</span></article>';
    host.appendChild(wrap);
  });
  const quoted = page.locator("#quote-probe .message-reply-preview");
  await expect(quoted).toBeVisible();
  if (shots) await page.locator("#quote-probe").screenshot({ path: `${shots}/reply-quote.png` });

  // White text on the light box was the bug: both lines must be dark.
  for (const selector of ["b", "span"]) {
    const color = await quoted.locator(selector).first().evaluate((el) => getComputedStyle(el).color);
    expect(color, `${selector} colour`).not.toBe("rgb(255, 255, 255)");
  }
  // The bubble's own text stays white on its green background.
  expect(await page.locator("#quote-probe .message-bubble > span:not(.message-reply-preview)").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
});
