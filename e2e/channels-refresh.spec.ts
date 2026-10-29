import { expect, test } from "@playwright/test";
import { skipPwaInstallPopup } from "./support";

test("connected channels survive refresh, overview failures and late setup responses", async ({ page }) => {
  await skipPwaInstallPopup(page);
  await page.addInitScript(() => localStorage.setItem("linkly-analytics-consent", "rejected"));
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const seed = await (await page.request.get("/api/settings/integration")).json();
  let failOverview = false;
  let holdInstagram = false;
  let releaseInstagram = () => {};
  const heldInstagram = new Promise<void>(resolve => { releaseInstagram = resolve; });
  const overviewQueries: string[] = [];
  const setupQueries: string[] = [];
  await page.route("**/api/settings/integration?*", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("channels")) {
      overviewQueries.push(url.search);
      if (failOverview) return route.fulfill({ status: 503, json: { message: "Temporary failure" } });
      return route.fulfill({ json: { channels: Object.fromEntries(url.searchParams.get("channels")!.split(",").map(channel => [channel, {
        ...seed, provider: channel === "whatsapp" ? "whatsapp_cloud" : channel,
        status: ["whatsapp", "instagram", "telegram", "website"].includes(channel) ? "connected" : "pending",
        wabaName: channel === "instagram" ? "instagram_account" : channel === "telegram" ? "telegram_bot" : ""
      }])) } });
    }
    const channel = url.searchParams.get("channel") || "whatsapp";
    setupQueries.push(channel);
    if (channel === "instagram" && holdInstagram) await heldInstagram;
    return route.fulfill({ json: { ...seed, provider: channel === "whatsapp" ? "whatsapp_cloud" : channel, status: "connected", wabaName: channel === "instagram" ? "instagram_account" : channel === "telegram" ? "telegram_bot" : "" } });
  });
  const openSettings = () => page.getByRole("navigation").getByRole("button", { name: "الإعدادات والربط", exact: true }).click();
  const card = (channel: string) => page.locator(".channel-connect-card").filter({ has: page.locator(`.channel-icon-${channel}`) });
  await openSettings();
  for (const channel of ["whatsapp", "instagram", "telegram", "website"]) await expect(card(channel).getByRole("button", { name: "متصل — إدارة", exact: true })).toBeVisible();
  await page.reload();
  for (const channel of ["instagram", "telegram", "website"]) await expect(card(channel).getByRole("button", { name: "متصل — إدارة", exact: true })).toBeVisible();
  expect(overviewQueries.every(query => new URLSearchParams(query).get("summary") === "1")).toBe(true);
  expect(setupQueries).toEqual([]); // Card rendering must not load per-channel settings.

  failOverview = true;
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "تعذر جلب حالات القنوات" })).toBeVisible();
  for (const channel of ["instagram", "telegram", "website"]) {
    await expect(card(channel).getByRole("button", { name: "ربط", exact: true })).toHaveCount(0);
    await expect(card(channel).getByRole("button", { name: "تعذر جلب الحالة", exact: true })).toBeDisabled();
  }
  failOverview = false;
  await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await expect(card("instagram").getByRole("button", { name: "متصل — إدارة" })).toBeVisible();

  holdInstagram = true;
  await card("instagram").getByRole("button", { name: "متصل — إدارة" }).click();
  const dialog = page.getByRole("dialog", { name: "إعداد القناة" });
  await expect(dialog.getByRole("status")).toContainText("جاري تحميل");
  await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
  await card("telegram").getByRole("button", { name: "متصل — إدارة" }).click();
  await expect(dialog).toContainText("telegram_bot");
  releaseInstagram();
  await expect(dialog).not.toContainText("instagram_account");
  await expect(card("telegram").getByRole("button", { name: "متصل — إدارة" })).toBeVisible();
  await page.screenshot({ path: "reports/channels-refresh-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
  await card("website").scrollIntoViewIfNeeded();
  await expect(card("website").getByRole("button", { name: "متصل — إدارة" })).toBeVisible();
  await page.screenshot({ path: "reports/channels-refresh-mobile.png" });
});
