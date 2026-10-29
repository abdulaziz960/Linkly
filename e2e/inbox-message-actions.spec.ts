import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("reply and copy stay inside their message on desktop and mobile", async ({ page, request }) => {
  const text = "هذا رابط الطلب https://example.com/order?id=42&lang=ar\nشكرًا لكم";
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "browser-waba", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "browser-number-id" },
    contacts: [{ wa_id: "966555000077", profile: { name: "عميل اختبار النسخ" } }],
    messages: [{ id: "message-actions-inbound", from: "966555000077", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }]
  } }] }] });
  const response = await request.post("/api/meta/webhook", { data: payload, headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", "browser-test-meta-secret").update(payload).digest("hex")}` } });
  expect(response.ok()).toBe(true);
  await skipPwaInstallPopup(page);
  await page.addInitScript(() => {
    localStorage.setItem("linkly-analytics-consent", "rejected");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { localStorage.setItem("test-copied-text", value); } } });
  });
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole("button", { name: /^عميل اختبار النسخ،/ }).click();
  const bubble = page.locator(".message-bubble").filter({ hasText: "هذا رابط الطلب" });
  for (const viewport of [{ width: 1366, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await bubble.scrollIntoViewIfNeeded();
    const bounds = (await bubble.boundingBox())!;
    for (const action of await bubble.locator(".message-actions button").all()) {
      const box = (await action.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(box.y).toBeGreaterThanOrEqual(bounds.y);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    await bubble.getByRole("button", { name: "نسخ الرسالة", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("test-copied-text"))).toBe(text);
    await bubble.getByRole("button", { name: "رد على الرسالة", exact: true }).click();
    await expect(page.locator(".composer-reply-preview")).toContainText("هذا رابط الطلب");
    await page.getByRole("button", { name: "إلغاء الرد", exact: true }).click();
    const link = bubble.locator("a.message-link");
    await link.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "خيارات الرسالة" });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate(el => el.parentElement === document.body)).toBe(true);
    const menuBounds = (await menu.boundingBox())!;
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height);
    await menu.getByRole("menuitem", { name: "نسخ الرابط", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("test-copied-text"))).toBe("https://example.com/order?id=42&lang=ar");
    await page.screenshot({ path: `reports/inbox-message-actions-${viewport.width}.png` });
  }
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Denied"); } } }); });
  await bubble.getByRole("button", { name: "نسخ الرسالة", exact: true }).click();
  await expect(page.getByText("تعذر النسخ، حدد النص وانسخه يدويًا", { exact: true })).toBeVisible();
});
