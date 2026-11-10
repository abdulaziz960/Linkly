import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

async function inbound(request: APIRequestContext, wa: string, name: string, id: string) {
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "browser-waba", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "browser-number-id" }, contacts: [{ wa_id: wa, profile: { name } }],
    messages: [{ id, from: wa, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: `مرحبا ${name}` } }]
  } }] }] });
  const response = await request.post("/api/meta/webhook", { data: payload, headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", "browser-test-meta-secret").update(payload).digest("hex")}` } });
  expect(response.ok()).toBe(true);
}

test("selected conversations can be closed and then deleted for good", async ({ page, request }) => {
  test.setTimeout(120000);
  await inbound(request, "966555000091", "عميل جماعي أول", "bulk-actions-1");
  await inbound(request, "966555000092", "عميل جماعي ثاني", "bulk-actions-2");
  await skipPwaInstallPopup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  const pick = async () => {
    await page.getByRole("checkbox", { name: /تحديد عميل جماعي أول/ }).check();
    await page.getByRole("checkbox", { name: /تحديد عميل جماعي ثاني/ }).check();
  };
  const bar = page.locator(".bulk-bar");
  const statuses = async () => {
    const body = JSON.stringify(await (await page.request.get("/api/conversations")).json());
    return { closed: (body.match(/عميل جماعي (?:أول|ثاني)[^}]*?"status":"closed"/g) || []).length, present: /عميل جماعي (?:أول|ثاني)/.test(body) };
  };

  // Close both.
  await pick();
  await bar.locator("select").first().selectOption("close");
  await bar.getByRole("button", { name: "تنفيذ" }).click();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByText("تم إغلاق 2 محادثة.")).toBeVisible();
  await expect.poll(async () => (await statuses()).closed).toBeGreaterThan(0);

  // Delete both: the option is there for the owner, says what it does, and asks first.
  await pick();
  await bar.locator("select").first().selectOption("delete");
  await expect(bar.getByRole("button", { name: "حذف المحدد" })).toBeVisible();
  await bar.getByRole("button", { name: "حذف المحدد" }).click();
  await expect(page.getByText(/لا يمكن التراجع/)).toBeVisible();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByText("تم حذف 2 محادثة.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /تحديد عميل جماعي/ })).toHaveCount(0);
  expect((await statuses()).present).toBe(false);
});
