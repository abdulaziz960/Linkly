import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

// Runs only against a deployment with projects switched on for the test account:
//   E2E_WORKSPACES=1 npx playwright test e2e/workspaces.spec.ts
test.skip(process.env.E2E_WORKSPACES !== "1", "needs E2E_WORKSPACES=1 (projects are off in the default test deployment)");

async function signIn(page: Page) {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const lateNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  await lateNotice.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await lateNotice.isVisible()) await lateNotice.getByRole("button", { name: "رفض", exact: true }).click();
}

test("the owner creates a project, switches between projects and sees a combined inbox with the project on each conversation", async ({ page, request }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "browser-waba", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "browser-number-id" }, contacts: [{ wa_id: "966555000077", profile: { name: "عميل المشروع الأول" } }],
    messages: [{ id: "ws-inbound", from: "966555000077", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "مرحبا" } }]
  } }] }] });
  const inbound = await request.post("/api/meta/webhook", { data: payload, headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", "browser-test-meta-secret").update(payload).digest("hex")}` } });
  expect(inbound.ok()).toBeTruthy();

  await signIn(page);
  const sidebar = page.locator(".dashboard-sidebar");
  // The account card became the project switcher.
  const switcher = sidebar.locator(".ws-switcher-btn");
  await expect(switcher).toBeVisible();
  await expect(sidebar.getByText("حساب العميل", { exact: true })).toHaveCount(0);

  // Create a second project: the plan includes one extra.
  await switcher.click();
  await page.getByRole("button", { name: /مشروع جديد/ }).click();
  const dialog = page.getByRole("dialog", { name: "مشروع جديد" });
  await dialog.getByLabel("اسم المشروع").fill("مشروع الاختبار الثاني");
  await dialog.getByRole("button", { name: "إنشاء المشروع" }).click();
  await expect(dialog).toBeHidden();

  // At the plan's limit the entry is locked and only explains.
  await switcher.click();
  await page.getByRole("button", { name: /مشروع جديد/ }).click();
  await expect(page.getByRole("dialog", { name: "إضافة مشروع" })).toContainText("باقتك لا تدعم إضافة مشروع آخر");
  await page.keyboard.press("Escape");

  // The combined view: every project's conversations, each labelled with its project.
  await switcher.click();
  await page.getByRole("option", { name: /كل المشاريع/ }).click();
  await expect(page.locator(".ws-switcher-btn")).toContainText("كل المشاريع");
  const card = page.getByRole("button", { name: /^عميل المشروع الأول،/ });
  await expect(card).toBeVisible();
  await expect(card.locator(".project-chip")).toBeVisible();
  await expect(card.locator(".platform-chip")).toBeVisible();
  // The channel number or username never shows on the card.
  await expect(card).not.toContainText("966555000077");

  // The project inside the page banner follows the same choice.
  await page.getByRole("button", { name: "الردود السريعة", exact: true }).first().click().catch(() => undefined);
  await expect(page.locator(".ws-hero-pill").first()).toBeVisible();
});
