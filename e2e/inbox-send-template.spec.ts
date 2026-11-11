import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

test("a template can be sent from the conversation while the 24-hour window is still open", async ({ page, request }) => {
  test.setTimeout(120000);
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "browser-waba", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "browser-number-id" }, contacts: [{ wa_id: "966555000094", profile: { name: "عميل القالب" } }],
    messages: [{ id: "send-template-inbound", from: "966555000094", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "السلام عليكم" } }]
  } }] }] });
  const response = await request.post("/api/meta/webhook", { data: payload, headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", "browser-test-meta-secret").update(payload).digest("hex")}` } });
  expect(response.ok()).toBe(true);
  await skipPwaInstallPopup(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole("button", { name: /^عميل القالب،/ }).click();

  // Window is open: the normal composer shows, and the template picker is one tap away from the "+" menu.
  await expect(page.locator(".window-notice")).toHaveCount(0);
  await page.getByRole("button", { name: /إضافة: إيموجي/ }).click();
  await page.getByRole("button", { name: "إرسال قالب معتمد", exact: true }).click();
  const panel = page.locator(".window-notice");
  await expect(panel).toContainText("إرسال قالب معتمد");
  await expect(panel).toContainText("حتى لو كانت نافذة الرد مفتوحة");
  await expect(panel.getByRole("button", { name: "إرسال القالب" })).toBeVisible();
  if (shots) await panel.screenshot({ path: `${shots}/send-template-panel.png` });

  await panel.getByRole("button", { name: "رجوع للكتابة" }).click();
  await expect(page.locator(".window-notice")).toHaveCount(0);
  await expect(page.locator("form.composer")).toBeVisible();
});
