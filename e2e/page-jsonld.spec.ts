import { expect, test, type Page } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

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

const jsonLdOn = (page: Page) => page.locator('script[type="application/ld+json"]').evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));

test("an admin adds structured data to a page from the page-SEO screen, and a wrong one is refused", async ({ page }) => {
  test.setTimeout(180000);
  await signInAsAdmin(page);
  const org = { "@context": "https://schema.org", "@type": "Organization", name: "Linkly E2E Org", url: "https://linklysa.io" };

  // A wrong value is refused with a clear message and nothing is saved.
  for (const bad of ["{ not json", JSON.stringify({ name: "no context" }), JSON.stringify({ "@context": "https://schema.org" })]) {
    const refused = await page.request.put("/api/admin/page-seo", { data: { path: "/contact", jsonLd: bad } });
    expect(refused.status()).toBe(400);
  }

  const saved = await page.request.put("/api/admin/page-seo", { data: { path: "/contact", jsonLd: JSON.stringify(org) } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  try {
    // The public page prints it (the page keeps the SEO rows in memory for up to 30 seconds), and only on that page.
    await expect(async () => {
      await page.goto("/contact");
      expect((await jsonLdOn(page)).some((text) => text.includes("Linkly E2E Org"))).toBe(true);
    }).toPass({ timeout: 60000, intervals: [3000] });
    await page.goto("/faq");
    expect((await jsonLdOn(page)).some((text) => text.includes("Linkly E2E Org"))).toBe(false);

    // The screen shows the saved data for editing.
    await page.goto("/linkly-admin007/page-seo");
    await page.getByRole("row", { name: /تواصل معنا \(عربي\)/ }).getByRole("button", { name: "تعديل" }).click();
    await expect(page.getByLabel(/بيانات منظمة JSON-LD/)).toHaveValue(/Linkly E2E Org/);
  } finally {
    const cleared = await page.request.put("/api/admin/page-seo", { data: { path: "/contact", jsonLd: "" } });
    expect(cleared.ok()).toBeTruthy();
  }
});
