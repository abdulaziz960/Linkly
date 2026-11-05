import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("turning the welcome on opens a ready message that goes straight to Meta and is chosen as the welcome", async ({ page }) => {
  test.setTimeout(120000);
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.setViewportSize({ width: 1280, height: 1800 });

  // Meta is not reachable from the test: the template request is answered as if Meta accepted it.
  let submitted: { name?: string; message?: string; category?: string } | null = null;
  await page.route("**/api/templates", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { name: submitted?.name } }) });
  });
  let saved: { enabled?: boolean; template?: string } | null = null;
  await page.route("**/api/leads/welcome", async (route) => {
    if (route.request().method() === "PUT") saved = route.request().postDataJSON();
    await route.continue();
  });

  await page.goto("/dashboard?view=pipeline");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "رسالة ترحيب تلقائية على واتساب" }) }).last();
  await section.scrollIntoViewIfNeeded();
  await section.getByLabel("تفعيل رسالة الترحيب").check();

  // The form is already open with a ready message: nothing to click first.
  const message = section.getByRole("textbox");
  await expect(message).toHaveValue(/\{\{1\}\}/);
  const shots = process.env.QUOTE_SHOTS_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await section.screenshot({ path: join(shots, "welcome-auto-open.png") });
  }
  await section.getByRole("button", { name: "إرسال للاعتماد من ميتا" }).click();
  await expect(section.getByRole("status")).toContainText("اختيرت كرسالة الترحيب");

  expect(submitted).not.toBeNull();
  expect(submitted!.category).toBe("UTILITY");
  expect(submitted!.message).toContain("{{1}}");
  // The new template is the chosen welcome and was saved at once.
  await expect.poll(() => saved?.template).toBe(submitted!.name);
  if (shots) await section.screenshot({ path: join(shots, "welcome-auto-sent.png") });
});
