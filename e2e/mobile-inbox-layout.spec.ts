import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("phone chat keeps messages and reply controls accessible", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await skipPwaInstallPopup(page);
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "browser-waba", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "browser-number-id" },
    contacts: [{ wa_id: "966555000088", profile: { name: "عميل تجربة الجوال" } }],
    messages: Array.from({ length: 20 }, (_, index) => ({ id: `mobile-layout-inbound-${index}`, from: "966555000088", timestamp: String(Math.floor(Date.now() / 1000) - 20 + index), type: "text", text: { body: `رسالة ${index + 1}: مرحباً، أحتاج مساعدة في الطلب. Thank you for your help.` } }))
  } }] }] });
  const inbound = await request.post("/api/meta/webhook", { data: payload, headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", "browser-test-meta-secret").update(payload).digest("hex")}` } });
  expect(inbound.ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const cookies = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookies.isVisible()) await cookies.getByRole("button", { name: "رفض", exact: true }).click();
  await page.getByRole("button", { name: /^عميل تجربة الجوال،/ }).click();
  for (const [width, height] of [[1280,520], [1280,584], [1366,620], [1440,640], [320,568], [360,800], [390,844], [430,932], [720,900], [768,1024], [1024,768], [1280,800], [1440,900], [1920,1080], [430,932]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".composer textarea")).toBeVisible();
    if (width >= 1280) await expect(page.locator(".inbox-side")).toBeVisible();
    else await expect(page.locator(".inbox-side")).toHaveCount(0);
    if (width > 720) {
      await expect.poll(() => page.evaluate(() => document.querySelector(".messages")!.getBoundingClientRect().height / document.querySelector(".chat-column")!.getBoundingClientRect().height)).toBeGreaterThan(.5);
    }
    await page.locator(".message-bubble").last().scrollIntoViewIfNeeded();
    await expect(page.locator(".message-bubble").last()).toBeInViewport();
    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      return { messages: rect(".messages").height, composerBottom: rect("form.composer").bottom, viewport: innerHeight, width: document.documentElement.scrollWidth, chatHeight: rect(".chat-column").height, head: rect(".chat-head").height, composer: rect("form.composer").height };
    });
    console.log("responsive", width, height, metrics);
    expect(metrics.messages).toBeGreaterThan(height * .3);
    if (width > 720) expect(metrics.messages).toBeGreaterThan(metrics.chatHeight * .5);
    expect(metrics.composerBottom).toBeLessThanOrEqual(height + 1);
    expect(metrics.width).toBeLessThanOrEqual(width);
    const close = await page.locator(".chat-close-btn").boundingBox();
    expect(close!.x).toBeGreaterThanOrEqual(0);
    expect(close!.x + close!.width).toBeLessThanOrEqual(width);
    await page.locator(".composer textarea").fill("مسودة رد واضحة للعميل");
    await expect(page.locator(".composer textarea")).toHaveValue("مسودة رد واضحة للعميل");
    if (width >= 1280) await expect(page.locator(".inbox-side")).toBeVisible();
    if (width > 720) await expect(page.locator(".conversation-column")).toBeVisible();
    await page.getByRole("button", { name: "إضافة إيموجي", exact: true }).click();
    await expect(page.locator("#conversation-emoji-picker")).toBeVisible();
    await page.getByRole("button", { name: "إضافة إيموجي", exact: true }).click();
    for (const selector of [".assign-field .custom-select-trigger", ".ai-tool-select .custom-select-trigger"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await expect(page.locator(selector)).toBeInViewport();
      await page.locator(selector).click();
      const menu = page.locator(".custom-select-list").filter({ visible: true });
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      await page.locator(selector).click();
    }
    await page.screenshot({ path: `reports/chat-height-${width}x${height}.png` });
  }
  await page.locator(".composer-modes button.note").click();
  await expect(page.locator(".composer-modes button.note")).toHaveClass(/active/);
  await page.locator(".composer textarea").fill("ملاحظة داخلية لاختبار تصميم المحادثات");
  await page.locator('.composer button[type="submit"]').click();
  await expect(page.locator(".messages")).toContainText("ملاحظة داخلية لاختبار تصميم المحادثات");
  await page.locator(".chat-tabs button").nth(1).click();
  await expect(page.locator(".profile-panel")).toBeVisible();
  await page.locator(".chat-tabs button").first().click();
  await page.locator(".mobile-back").click();
  await expect(page.locator(".conversation-column")).toBeVisible();
  expect(errors).toEqual([]);
});
