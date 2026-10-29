import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

for (const viewport of [{ width: 1366, height: 720 }, { width: 390, height: 844 }]) {
  test(`campaign report scrolls to every row and pagination at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await skipPwaInstallPopup(page);
    await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
    await page.route(/\/api\/campaigns(?:\?.*)?$/, route => route.fulfill({ json: { ok: true, data: [
      { id: "scroll-report", name: "Scroll test", sent: 80, total: 80, progress: "100%", status: "الحملة أنجزت", updatedAt: new Date().toISOString() }
    ] } }));
    await page.route("**/api/campaigns/scroll-report/report", route => route.fulfill({ json: { ok: true, data: { recipients: Array.from({ length: 80 }, (_, index) => ({
      phone: `96650000${String(index).padStart(4, "0")}`, name: `Customer ${index + 1}`, status: "تم الإرسال", error: "", date: new Date().toISOString(),
      readAt: "", clickedAt: "", clickCount: 0, clicks: [], deliveryFailed: 0
    })) } } }));
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("owner@browser.test");
    await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/dashboard?view=campaigns");
    await page.getByRole("row", { name: /Scroll test/ }).getByRole("button", { name: "التقرير", exact: true }).click();
    const modal = page.getByRole("dialog", { name: /تقرير الحملة Scroll test/ });
    const body = modal.locator(".campaign-report-body");
    await expect(body.getByRole("cell", { name: "Customer 10", exact: true })).toBeAttached();
    expect(await body.evaluate(el => ["auto", "scroll"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)).toBe(true);
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(body.locator(".campaign-pages")).toBeInViewport();
    await body.locator(".campaign-pages button").last().click();
    await expect(body.getByRole("cell", { name: "Customer 20", exact: true })).toBeAttached();
    await expect(modal.getByRole("button", { name: "حسنًا", exact: true })).toBeInViewport();
    const bounds = await modal.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({ path: `reports/campaign-report-scroll-${viewport.width}.png` });
  });
}
