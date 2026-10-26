import { expect, test } from "@playwright/test";

for (const [path, lang, h1] of [["/pricing", "ar", /أسعار Linkly/], ["/en/pricing", "en", /Linkly pricing/]] as const) {
  test(`${path}: its own page with plans, one H1, canonical, hreflang and offers`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(h1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://linklysa.io${path}`);
    expect(await page.locator('link[rel="alternate"]').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator("#pricing").getByRole("tab").first()).toBeVisible();
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.join("")).toContain('"Offer"');
    expect(errors).toEqual([]);
  });
}

test("the sitemap lists pricing and the guides with lastmod, and llms.txt describes the site", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const url of ["https://linklysa.io/pricing", "https://linklysa.io/en/pricing", "https://linklysa.io/solutions/whatsapp-campaigns", "https://linklysa.io/en/solutions/clinics-whatsapp-inbox"]) expect(sitemap).toContain(`<loc>${url}</loc>`);
  expect(sitemap).toMatch(/<lastmod>2026-10-26/);
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(llms.headers()["content-type"]).toContain("text/plain");
  const text = await llms.text();
  expect(text).toContain("# Linkly");
  expect(text).toContain("https://linklysa.io/pricing");
});

test("every guide page renders once in both languages with one H1", async ({ page }) => {
  for (const slug of ["whatsapp-campaigns", "whatsapp-auto-reply", "restaurants-whatsapp-inbox", "clinics-whatsapp-inbox"]) {
    for (const prefix of ["", "/en"]) {
      const response = await page.goto(`${prefix}/solutions/${slug}`);
      expect(response?.status(), `${prefix}/solutions/${slug}`).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h2").first()).toBeVisible();
    }
  }
});

test("the home page footer links to the pricing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("footer").getByRole("link", { name: "الأسعار" })).toHaveAttribute("href", "/pricing");
});
