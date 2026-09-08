import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test("WhatsApp CTA → signed inbound webhook → Inbox → AI draft → Pipeline → Analytics", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let whatsAppText = "";
  // Simulate the external WhatsApp handoff, preserving the actual link text.
  await page.route("https://wa.me/**", async (route) => {
    whatsAppText = new URL(route.request().url()).searchParams.get("text") || "";
    await route.fulfill({ contentType: "text/html", body: "<p>WhatsApp test handoff</p>" });
  });
  await page.goto("/?utm_source=google&utm_medium=cpc&utm_campaign=browser-journey");
  const recorded = page.waitForResponse((response) => response.url().includes("/api/attribution/click") && response.request().method() === "POST");
  await page.getByRole("link", { name: "راسلنا واتساب" }).click();
  expect((await recorded).ok()).toBeTruthy();
  await expect(page).toHaveURL(/wa\.me/);
  expect(whatsAppText).toMatch(/\[REF:[a-f0-9]+\]/);

  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "browser-waba", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "browser-number-id" },
    contacts: [{ wa_id: "966555000099", profile: { name: "عميل اختبار الرحلة" } }],
    messages: [{ id: "browser-inbound-1", from: "966555000099", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: whatsAppText } }]
  } }] }] });
  const signature = createHmac("sha256", "browser-test-meta-secret").update(payload).digest("hex");
  const inbound = await request.post("/api/meta/webhook", { data: payload, headers: {
    "content-type": "application/json", "x-hub-signature-256": `sha256=${signature}`
  } });
  expect(inbound.ok(), await inbound.text()).toBeTruthy();

  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText("عميل اختبار الرحلة", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /^عميل اختبار الرحلة،/ }).click();
  await expect(page.locator("body")).not.toContainText("[REF:");

  // External model output is deterministic here; the server AI adapter is
  // covered separately by the API integration suite.
  await page.route("**/suggest-reply", (route) => route.fulfill({ json: {
    ok: true, data: { suggestion: "أهلاً بك، يسعدني مساعدتك في اختيار الباقة." }
  } }));
  await page.getByRole("button", { name: "اقترح رد بالذكاء الاصطناعي" }).click();
  await expect(page.locator("textarea").filter({ visible: true }).first()).toHaveValue("أهلاً بك، يسعدني مساعدتك في اختيار الباقة.");

  await page.getByRole("navigation").getByRole("button", { name: "كانبان المبيعات", exact: true }).click();
  const card = page.locator('.pipeline-card').filter({ hasText: "عميل اختبار الرحلة" });
  await expect(card).toBeVisible();
  await card.getByRole("combobox", { name: "مرحلة الصفقة" }).selectOption("عرض سعر");
  await expect(card.getByRole("spinbutton", { name: "قيمة الصفقة" })).toBeVisible();
  await card.getByRole("spinbutton", { name: "قيمة الصفقة" }).fill("7200");
  await card.getByRole("spinbutton", { name: "قيمة الصفقة" }).blur();
  await expect(card.getByRole("status")).toContainText("تم حفظ القيمة");
  await card.getByRole("combobox", { name: "مرحلة الصفقة" }).selectOption("فاز");
  await expect(card.getByRole("status")).toContainText("تم حفظ المرحلة");
  await page.reload();
  await expect(card.getByRole("combobox", { name: "مرحلة الصفقة" })).toHaveValue("فاز");
  await expect(card.getByRole("spinbutton", { name: "قيمة الصفقة" })).toHaveValue("7200");

  await page.getByRole("navigation").getByRole("button", { name: "التقارير", exact: true }).click();
  const revenue = page.locator(".panel-body").filter({ has: page.getByRole("heading", { name: "الإيراد حسب الرابط", exact: true }) });
  await expect(revenue).toContainText("hero-whatsapp");
  const conversions = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "التحويلات", exact: true }) });
  await expect(conversions).toContainText(/7[٬,]?200|٧[٬,]?٢٠٠/);
  await expect(conversions).toContainText("home");
  await expect(conversions).toContainText("أفضل أزرار الدعوة للإجراء");
  await page.getByRole("navigation").getByRole("button", { name: "إعدادات مساعد AI", exact: true }).click();
  await page.getByRole("combobox", { name: "المزود", exact: true }).selectOption("openai");
  await page.getByLabel("معرّف الموديل", { exact: true }).fill("test-model");
  await page.getByLabel("مفتاح API", { exact: true }).fill("browser-test-key-not-a-real-secret");
  await page.getByRole("button", { name: "حفظ إعدادات AI", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("تم حفظ إعدادات AI");
  await expect(page.getByLabel("مفتاح API", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("مفتاح API", { exact: true })).toHaveAttribute("placeholder", /محفوظ/);
  const settingsResponse = await page.request.get("/api/ai/settings");
  expect(settingsResponse.ok()).toBeTruthy();
  expect(await settingsResponse.text()).not.toContain("browser-test-key-not-a-real-secret");
  expect(errors).toEqual([]);
});
