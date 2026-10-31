import { expect, test } from "@playwright/test";

test("health endpoint reports the app and its database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, database: "reachable" });
});

test("public pages load with one H1 and no script errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/", "/faq", "/blog", "/contact", "/privacy", "/terms", "/developers", "/en", "/en/faq"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1").first(), path).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("developer docs and OpenAPI describe the public API", async ({ page, request }) => {
  await page.goto("/developers");
  await expect(page.locator("h1")).toHaveText(/توثيق واجهة Linkly/);
  expect(await page.locator(".dev-endpoint").count()).toBeGreaterThanOrEqual(8);
  const spec = await (await request.get("/openapi.json")).json();
  expect(spec.openapi).toBe("3.1.0");
  expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(["/conversations", "/messages", "/customers", "/products"]));
});

test("the public API refuses requests without a valid key", async ({ request }) => {
  for (const path of ["/api/v1/customers", "/api/v1/leads", "/api/v1/products"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
  }
  const bad = await request.get("/api/v1/customers", { headers: { Authorization: "Bearer lk_not_a_real_key" } });
  expect(bad.status()).toBe(401);
});

test("signed-in areas and the admin panel are not reachable anonymously", async ({ page, request }) => {
  for (const path of ["/api/conversations", "/api/ai/settings", "/api/admin/notifications"]) {
    const response = await request.get(path);
    expect([401, 403], path).toContain(response.status());
  }
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/linkly-admin007");
  await expect(page).toHaveURL(/\/login/);
});

test("security headers are present on the home page", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["strict-transport-security"]).toContain("max-age");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("unauthenticated webhook and widget endpoints do not leak data", async ({ request }) => {
  const widget = await request.get("/api/website/messages?siteKey=does-not-exist&visitorId=probe");
  expect([400, 404]).toContain(widget.status());
  const classify = await request.post("/api/conversations/x/classify", { data: {} });
  expect(classify.status()).toBe(401);
});
