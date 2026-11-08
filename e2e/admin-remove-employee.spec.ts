import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

// Needs a client with a subscription and a non-owner employee: runs with E2E_WORKSPACES=1 (see e2e/server.mjs), skipped otherwise.
test.skip(process.env.E2E_WORKSPACES !== "1", "needs the E2E_WORKSPACES seed (a client with a subscription)");

async function login(page: Page, email: string, landing: RegExp) {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(landing);
}

test("support removes a client's employee from the client file, moving the open conversations first", async ({ browser }) => {
  test.setTimeout(180000);
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });
  const unique = Date.now().toString(36);

  // The client's owner has two employees, one of them holding an open conversation.
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await login(owner, "owner@browser.test", /dashboard/);
  for (const name of [`المغادر ${unique}`, `الزميل ${unique}`]) {
    const created = await owner.request.post("/api/employees", { data: { name, email: `${name.includes("المغادر") ? "leaver" : "mate"}-${unique}@browser.test`, role: "موظف دعم", permissions: "محادثات فقط" } });
    expect(created.ok(), await created.text()).toBe(true);
  }
  const customer = (await (await owner.request.post("/api/customers", { data: { name: `عميل ${unique}`, phone: "0553334455" } })).json()) as { data: { id: string } };
  const assigned = await owner.request.patch(`/api/conversations/${customer.data.id}`, { data: { assignee: `المغادر ${unique}`, status: "assigned" } });
  await ownerContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1300, height: 1400 } });
  const admin = await adminContext.newPage();
  await login(admin, "admin@browser.test", /linkly-admin007/);
  await admin.goto("/linkly-admin007/clients/browser-workspace");
  await admin.getByRole("tab", { name: /المستخدمون/ }).click();
  const row = admin.locator("li", { hasText: `المغادر ${unique}` });
  await expect(row).toBeVisible();
  if (shots) { await row.scrollIntoViewIfNeeded(); await admin.waitForTimeout(300); await admin.screenshot({ path: join(shots, "admin-remove-employee.png") }); }
  await row.getByRole("button", { name: /^إزالة/ }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "إزالة الموظف" }).click();

  if (assigned.ok()) {
    // An open conversation must move to someone before the employee can go.
    const move = admin.getByRole("dialog", { name: "نقل المحادثات المفتوحة" });
    await expect(move).toBeVisible();
    await move.getByRole("combobox").selectOption({ label: `الزميل ${unique}` });
    if (shots) { await admin.waitForTimeout(300); await admin.screenshot({ path: join(shots, "admin-remove-employee-move.png") }); }
    await move.getByRole("button", { name: "إزالة ونقل المحادثات" }).click();
  }
  await expect(admin.locator("li", { hasText: `المغادر ${unique}` })).toHaveCount(0);
  await expect(admin.locator("li", { hasText: `الزميل ${unique}` })).toBeVisible();
  await adminContext.close();
});
