import { expect, test } from "@playwright/test";

test("landing analytics waits for cookie consent and keeps its CSP", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com\/gtm\.js|clarity\.ms/.test(request.url())) requests.push(request.url());
  });
  // This test verifies when the request is issued, not a third-party response.
  await page.route("https://www.googletagmanager.com/gtm.js**", (route) => route.abort());

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("https://www.clarity.ms");
  await expect(page.getByRole("dialog", { name: "إشعار الكوكيز" })).toBeVisible();
  await page.waitForTimeout(1200);
  expect(requests).toEqual([]);

  await page.getByRole("button", { name: "قبول", exact: true }).click();
  await expect(page.locator("#linkly-gtm")).toHaveCount(1);
  await expect.poll(() => requests.some((url) => url.includes("googletagmanager.com/gtm.js"))).toBe(true);
});
