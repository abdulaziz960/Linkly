import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { PRICING_SLOTS } from "../lib/landing-slots";
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

const slotId = (lang: "ar" | "en", text: string) => `${lang}:${createHash("sha1").update(text).digest("hex").slice(0, 10)}`;

test("an admin replaces the pricing page headline from the texts screen, and puts it back", async ({ page }) => {
  test.setTimeout(180000);
  await signInAsAdmin(page);
  const slot = PRICING_SLOTS.ar[0];
  const id = slotId("ar", slot.text);
  // The screen lists it (with the home page texts).
  await page.goto("/linkly-admin007/landing");
  await expect(page.getByText(slot.label).first()).toBeVisible();

  const saved = await page.request.put("/api/admin/landing", { data: { id, value: "عنوان جديد لصفحة الأسعار من اللوحة" } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  try {
    await expect(async () => {
      await page.goto("/pricing");
      await expect(page.locator("h1")).toHaveText("عنوان جديد لصفحة الأسعار من اللوحة", { timeout: 2000 });
    }).toPass({ timeout: 60000, intervals: [3000] });
  } finally {
    expect((await page.request.put("/api/admin/landing", { data: { id, value: "" } })).ok()).toBeTruthy();
  }
  await expect(async () => {
    await page.goto("/pricing");
    await expect(page.locator("h1")).toHaveText(slot.text, { timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
});

test("an admin edits the contact page text and adds structured data to a blog post", async ({ page }) => {
  test.setTimeout(240000);
  await signInAsAdmin(page);

  // Contact page: the intro paragraph changes, the buttons box stays.
  await page.goto("/linkly-admin007/legal-pages");
  await page.getByRole("row", { name: /نساعدك في تجهيز مساحة عملك/ }).getByRole("button", { name: "تعديل" }).click();
  const dialog = page.getByRole("dialog", { name: /تعديل — تواصل معنا/ });
  const body = dialog.locator("#legal-body-ar");
  await body.fill((await body.inputValue()).replace("وسنرد عليك خلال ساعات العمل.", "وسنرد عليك خلال يوم عمل واحد."));
  await dialog.getByRole("button", { name: "حفظ" }).click();
  await expect(dialog).toBeHidden();

  // Blog post: a wrong value is refused, a right one is printed on the post page.
  const base = { slug: "jsonld-e2e", date: "2026-11-18", titleAr: "مقال البيانات المنظمة", descriptionAr: "وصف", bodyAr: "نص المقال", published: true };
  expect((await page.request.post("/api/admin/blog", { data: { ...base, jsonLd: "{ bad" } })).status()).toBe(400);
  const node = { "@context": "https://schema.org", "@type": "HowTo", name: "كيف تجرب البيانات المنظمة" };
  const created = await page.request.post("/api/admin/blog", { data: { ...base, jsonLd: JSON.stringify(node) } });
  expect(created.ok(), await created.text()).toBeTruthy();

  await expect(async () => {
    await page.goto("/blog/jsonld-e2e");
    const scripts = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) => nodes.map((item) => item.textContent ?? ""));
    expect(scripts.some((text) => text.includes("BlogPosting"))).toBe(true); // the automatic Article data stays
    expect(scripts.some((text) => text.includes("كيف تجرب البيانات المنظمة"))).toBe(true);
  }).toPass({ timeout: 60000, intervals: [3000] });

  await expect(async () => {
    await page.goto("/contact");
    await expect(page.getByText("وسنرد عليك خلال يوم عمل واحد.")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
  await expect(page.getByRole("link", { name: "راسلنا واتساب" })).toBeVisible(); // the buttons box is still there

  // Put the contact page back.
  await page.goto("/linkly-admin007/legal-pages");
  await page.getByRole("row", { name: /نساعدك في تجهيز مساحة عملك/ }).getByRole("button", { name: "إرجاع للأصل" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "إرجاع", exact: true }).click();
  // The public page keeps its text for up to 30 seconds: wait until the original is back so the next spec does not meet the edited one.
  await expect(async () => {
    await page.goto("/contact");
    await expect(page.getByText("وسنرد عليك خلال ساعات العمل.")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60000, intervals: [3000] });
});
