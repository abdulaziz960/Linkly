import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Switch pricing between monthly and yearly", async ({ page }) => {
  await page.goto("/en#pricing");
  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("tab", { name: "Monthly" })).toHaveAttribute("aria-selected", "true");
  await pricing.getByRole("tab", { name: /Yearly/ }).click();
  await expect(pricing.getByRole("tab", { name: /Yearly/ })).toHaveAttribute("aria-selected", "true");
  await expect(pricing).toContainText("/ year");
  await expect(pricing).not.toContainText("/ month");
  await expect(page).toHaveURL(/billing=yearly/);
  await pricing.getByRole("tab", { name: "Monthly" }).focus();
  await page.keyboard.press("Enter");
  await expect(pricing.getByRole("tab", { name: "Monthly" })).toHaveAttribute("aria-selected", "true");
  await expect(pricing).toContainText("/ month");
});

test("Switch pricing to yearly billing from the URL", async ({ page }) => {
  await page.goto("/en?billing=yearly#pricing");
  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("tab", { name: /Yearly/ })).toHaveAttribute("aria-selected", "true");
  await expect(pricing).toContainText("/ year");
  await expect(pricing).not.toContainText("/ month");
});

test("Account billing shows the same yearly price and cycle", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/billing?billing=yearly");
  await expect(page.getByRole("tab", { name: /سنوي/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".plan-grid")).toContainText("ر.س / سنويًا");
  await expect(page.locator(".plan-grid")).not.toContainText("ر.س / شهريًا");
});

test("Open cookie settings from the privacy page", async ({ page }) => {
  await page.goto("/privacy");
  await page.locator(".legal-links").getByRole("button", { name: "إعدادات الكوكيز" }).click();
  const settings = page.getByRole("dialog", { name: "إعدادات الكوكيز" });
  await expect(settings).toBeVisible();
  await expect(settings).toContainText("كوكيز التحليلات");
  await settings.getByRole("button", { name: "رفض" }).click();
  await expect(settings).toBeHidden();
  await page.locator(".legal-links").getByRole("button", { name: "إعدادات الكوكيز" }).click();
  await expect(settings).toContainText("معطّلة");
});

for (const language of ["ar", "en"] as const) {
  test(`Create a workspace in ${language === "ar" ? "Arabic" : "English"} with a fresh email`, async ({ page }) => {
    const email = `trial-${randomUUID().slice(0, 12)}@example.test`;
    await page.goto("/signup");
    if (language === "en") await page.getByRole("button", { name: "English" }).click();
    const form = page.locator(".journey-form");
    await form.locator('[name="companyName"]').fill("Mobile Test Company");
    await form.locator('[name="ownerName"]').fill("Browser Test Owner");
    await form.locator('[name="ownerEmail"]').fill(email);
    await form.locator('[name="phone"]').fill("0501234567");
    await form.locator('[type="checkbox"]').check();
    await form.locator(".journey-submit").click();
    await expect(page).toHaveURL(/\/(activate|signup\/success)/);
  });
}

test("Sign in with valid credentials repeatedly without triggering the failed-login limit", async ({ request }) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await request.post("/api/auth/login", {
      data: { email: "owner@browser.test", password: "Browser-only-Password-927!" }
    });
    expect(response.status(), `valid login attempt ${attempt + 1}`).toBe(200);
  }
});

test("Repeated invalid credentials still trigger the login limit", async ({ request }) => {
  const email = `invalid-${randomUUID().slice(0, 12)}@example.test`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.post("/api/auth/login", { data: { email, password: "not-the-password" } });
    expect(response.status(), `invalid login attempt ${attempt + 1}`).toBe(401);
  }
  const limited = await request.post("/api/auth/login", { data: { email, password: "not-the-password" } });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
});
