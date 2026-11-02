import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { skipPwaInstallPopup } from "./support";

const shots = process.env.QUOTE_SHOTS_DIR || "";

async function signInAsAdmin(page: Page) {
  await skipPwaInstallPopup(page);
  await page.goto("/login");
  const cookieNotice = page.getByRole("dialog", { name: "إشعار الكوكيز" });
  if (await cookieNotice.isVisible()) await cookieNotice.getByRole("button", { name: "رفض", exact: true }).click();
  await page.locator('input[name="email"]').fill("admin@browser.test");
  await page.locator('input[name="password"]').fill("Browser-only-Password-927!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/linkly-admin007/);
}

test("an admin writes a quotation, sends it, and the client approves it from the link", async ({ page, browser }) => {
  test.setTimeout(180000);
  if (shots) mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsAdmin(page);

  await page.goto("/linkly-admin007/quotes");
  await expect(page.getByText("لا توجد عروض أسعار بعد")).toBeVisible();
  await page.getByRole("link", { name: "عرض سعر جديد" }).first().click();
  await expect(page).toHaveURL(/quotes\/new/);

  await page.getByLabel("اسم العميل (يظهر في «مقدم إلى»)").fill("ELECT");
  await page.getByLabel("البريد الإلكتروني (يصله رابط العرض)").fill("client@example.com");
  await page.getByLabel("الشخص المسؤول").fill("ماجد");
  await page.getByLabel("الرقم الضريبي").fill("312152534500003");
  // Each service picked brings its own line; the messages line suggests its price from what was filled in.
  await page.getByRole("button", { name: /رسائل واتساب ترويجية/ }).click();
  await page.getByRole("button", { name: /إعداد وتجهيز الرقم/ }).click();
  await page.getByRole("button", { name: /التوثيق التجاري/ }).click();
  // The client's workspace is made on the Individuals plan unless the quote has a line for another plan (the test database has no Individuals plan,
  // so a plan line, priced at zero here to keep the totals, picks the plan it is made on).
  await expect(page.getByText("باقة مساحة العميل")).toBeVisible();
  await page.getByRole("button", { name: /باقة اختبار المتصفح/ }).click();
  const planCard = page.locator(".quote-line", { hasText: "باقة المساحة" });
  await planCard.getByLabel("سعر الوحدة (ر.س)").fill("0");

  const messagesCard = page.locator(".quote-line", { hasText: "رسائل واتساب ترويجية" });
  await expect(messagesCard.getByLabel("سعر الوحدة (ر.س)")).toHaveValue("22500");
  await messagesCard.getByLabel("عدد الرسائل").fill("100000");
  await expect(messagesCard.getByLabel("سعر الوحدة (ر.س)")).toHaveValue("30000");
  await messagesCard.getByLabel("عدد الرسائل").fill("75000");
  await expect(messagesCard.getByLabel("اسم البند")).toHaveValue("رسائل واتساب ترويجية إلى 75,000 رقم");
  await expect(page.locator(".quote-total")).toContainText("29,325");

  // The AI buttons: one under each service (its description), one for the cover and terms, one on the side for everything.
  await messagesCard.getByLabel("الوصف (يظهر تحت البند في العرض)").fill("");
  await messagesCard.getByRole("button", { name: /اكتب الوصف بالذكاء الاصطناعي/ }).click();
  await expect(messagesCard.getByLabel("الوصف (يظهر تحت البند في العرض)")).toHaveValue("رسوم ميتا: 0.216 ريال للرسالة · خدمة لنكلي: 0.084 ريال للرسالة");
  await page.getByRole("button", { name: /اكتب الغلاف والشروط بالذكاء الاصطناعي/ }).click();
  await expect(page.getByLabel("العنوان الرئيسي")).toHaveValue("نصل برسالتك إلى عملائك");
  await page.getByLabel("العنوان الرئيسي").fill("");
  await page.getByRole("button", { name: /صياغة العرض كاملًا بالذكاء الاصطناعي/ }).click();
  await expect(page.getByLabel("العنوان الرئيسي")).toHaveValue("نصل برسالتك إلى عملائك");
  await expect(page.locator(".quote-line").nth(1).getByLabel("الوصف (يظهر تحت البند في العرض)")).toHaveValue("تهيئة الرقم وربطه بمنصة لنكلي");
  await expect(page.locator(".quote-total")).toContainText("29,325"); // the prices never move
  // The preview opens as a pop-up over the form and closes back to it.
  await page.getByRole("button", { name: "معاينة العرض" }).click();
  const preview = page.getByRole("dialog", { name: "معاينة عرض السعر" });
  await expect(preview.locator(".qd")).toBeVisible();
  await expect(preview.locator(".qd-total-value")).toContainText("29,325");
  if (shots) await page.screenshot({ path: `${shots}/preview-popup.png` });
  await preview.getByRole("button", { name: "إغلاق", exact: true }).last().click();
  await expect(preview).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/editor.png`, fullPage: true });

  await page.getByRole("button", { name: "إرسال للعميل بالإيميل" }).click();
  await page.getByRole("dialog", { name: "إرسال العرض للعميل؟" }).getByRole("button", { name: "إرسال", exact: true }).click();
  const link = await page.getByRole("dialog", { name: "تم إرسال العرض" }).locator("input").inputValue();
  expect(link).toMatch(/\/q\/[A-Za-z0-9_-]{40,}$/);
  await page.getByRole("dialog", { name: "تم إرسال العرض" }).getByRole("button", { name: "تمام" }).click();
  await expect(page.locator(".ds-badge", { hasText: "مُرسل" }).first()).toBeVisible();

  // The client, with no login at all, opens the link and approves.
  const client = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await client.goto(link);
  await expect(client.locator(".qd")).toBeVisible();
  await expect(client.locator(".qd-total-value")).toContainText("29,325");
  await expect(client.locator(".qd-cards")).toContainText("ELECT");
  if (shots) await client.screenshot({ path: `${shots}/client-page.png`, fullPage: true });
  client.once("dialog", (dialog) => void dialog.accept());
  await client.getByRole("button", { name: "اعتماد العرض" }).click();
  await expect(client.getByText(/تم اعتماد العرض وجهّزنا مساحتكم/)).toBeVisible();
  await expect(client.getByRole("button", { name: "اعتماد العرض" })).toHaveCount(0);
  await client.close();

  // Approval made the workspace and put the amount waiting; the platform team confirms the transfer.
  await page.goto("/linkly-admin007/quotes");
  const row = page.locator("tr", { hasText: "ELECT" });
  await expect(row.locator(".ds-badge", { hasText: "معتمد" })).toBeVisible();
  await expect(row.locator(".ds-badge", { hasText: "بانتظار الدفع" })).toBeVisible();
  await row.getByRole("link", { name: /Q-00001/ }).click();
  await expect(page.locator(".quote-after")).toContainText("أُنشئت وأُرسل رابط التفعيل");
  if (shots) await page.screenshot({ path: `${shots}/after-approval.png`, fullPage: true });
  await page.getByRole("button", { name: "تم استلام الدفع" }).first().click();
  await page.getByRole("dialog", { name: "تأكيد استلام الدفع؟" }).getByRole("button", { name: "تم استلام الدفع" }).click();
  await expect(page.locator(".quote-after")).toContainText("مؤكد، والاشتراك مفعّل");
  await page.goto("/linkly-admin007/quotes");
  await expect(page.locator("tr", { hasText: "ELECT" }).locator(".ds-badge", { hasText: "مدفوع" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/list.png` });
});
