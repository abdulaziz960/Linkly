import { expect, test } from "@playwright/test";

test("production CSP permits hydration, rejects untrusted inline code and survives navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  const csp = response!.headers()["content-security-policy"];
  const scriptPolicy = csp.split(";").find((directive) => directive.trim().startsWith("script-src"))!;
  expect(scriptPolicy).toContain("'nonce-");
  expect(scriptPolicy).not.toContain("'unsafe-inline'");
  expect(scriptPolicy).not.toContain("'unsafe-eval'");
  const nonce = /'nonce-([^']+)'/.exec(scriptPolicy)![1];
  expect(await page.locator('script:not([src])').evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce))).toEqual(expect.arrayContaining([nonce]));
  // A real injected DOM script must be blocked by the browser, not just by a string assertion.
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = 'document.documentElement.dataset.untrustedScript = "ran"';
    document.body.appendChild(script);
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-untrusted-script", "ran");
  await page.getByRole("button", { name: "رفض", exact: true }).click();
  await page.getByRole("tab", { name: /سنوي/ }).click();
  await expect(page.getByRole("tab", { name: /سنوي/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", /Every customer conversation/);
  expect(errors).toEqual([]);
});

test("account pages expose noindex without inheriting homepage canonical", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).not.toMatch(/Disallow: \/(login|signup|forgot-password)/);
  for (const path of ["/login", "/signup", "/forgot-password", "/signup/success"]) {
    await page.goto(path);
    expect(await page.locator('meta[name="robots"]').first().getAttribute("content")).toContain("noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

test("mobile notice stays compact and guides are discoverable in both languages", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const notice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  await expect(notice).toBeVisible();
  expect((await notice.boundingBox())!.height).toBeLessThan(165);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await notice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.getByRole("link", { name: "إدارة واتساب لفريق خدمة العملاء من صندوق واحد", exact: true }).click();
  await expect(page).toHaveURL(/\/solutions\/whatsapp-team-inbox$/);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "قارن الباقات والرسوم" })).toBeVisible();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/solutions\/whatsapp-team-inbox$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("https://linklysa.io/solutions/salla-whatsapp-notifications");
  expect(sitemap).toContain("https://linklysa.io/en/solutions/salla-whatsapp-notifications");
});
