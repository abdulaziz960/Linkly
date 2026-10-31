import { expect, test, type Page } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

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

// The default e2e deployment has projects switched off for every account (this check does not apply when E2E_WORKSPACES=1).
test.skip(process.env.E2E_WORKSPACES === "1", "projects are on for the test account in this run");
test("an account without projects sees the plain account card and a locked 'add a project' entry that only explains", async ({ page }) => {
  await signIn(page);
  const sidebar = page.locator(".dashboard-sidebar");
  await expect(sidebar.getByText("حساب العميل", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /مساحة|كل المشاريع/ })).toHaveCount(0);

  await sidebar.getByRole("button", { name: /إضافة مشروع/ }).click();
  const dialog = page.getByRole("dialog", { name: "إضافة مشروع" });
  await expect(dialog).toContainText("باقتك لا تدعم إضافة مشروع آخر");
  await expect(dialog.getByRole("link", { name: "تواصل معنا" })).toHaveAttribute("href", "/contact");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The server answers as if the feature did not exist, whatever the page shows.
  for (const [method, path] of [["get", "/api/workspaces"], ["get", "/api/workspaces/inbox?mode=all"], ["get", "/api/workspaces/assignees"]] as const) {
    expect((await page.request[method](path)).status()).toBe(404);
  }
  expect((await page.request.post("/api/workspaces/projects", { data: { name: "مشروع" } })).status()).toBe(404);
  expect((await page.request.post("/api/workspaces/scope", { data: { scope: "all" } })).status()).toBe(404);
  expect((await page.request.post("/api/workspaces/assign", { data: { conversationId: "x", employeeId: "y" } })).status()).toBe(404);
});
