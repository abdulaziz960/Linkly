import { expect, test } from "@playwright/test";

// A card that needs 3-D Secure comes back to this page, which must confirm it with the route for what was bought.
test("returning from the bank confirms an email credit payment with the email route", async ({ page }) => {
  await page.route("**/confirm-payment", (route) => route.fulfill({ json: { ok: true, outcome: "completed" } }));
  const confirmed = page.waitForRequest("**/confirm-payment");
  await page.goto("/billing/success?paymentId=pay-email-1&kind=email_topup&id=pay_1");
  expect(new URL((await confirmed).url()).pathname).toBe("/api/email-promotions/balance/confirm-payment");
  await expect(page.getByRole("heading", { name: "تمت إضافة رصيد البريد" })).toBeVisible();
});
