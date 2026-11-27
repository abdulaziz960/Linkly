import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");
const form = read("app/billing/pay/[paymentId]/MoyasarPayForm.tsx");
const success = read("app/billing/success/page.tsx");

describe("embedded checkout auto-renew", () => {
  it("asks Moyasar to tokenize the card where the form reads it", () => {
    expect(form).toContain("...(renewal ? { credit_card: { save_card: true } } : {})");
    expect(form).not.toMatch(/\?\s*\{\s*save_card:/);
  });

  it("tells the customer what renewals will take and how to stop them, before the card fields", () => {
    const notice = form.indexOf('className="renewal-notice"');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(form.indexOf('className="mysr-form"'));
    expect(form).toContain("يتجدد تلقائيًا");
    expect(form).toContain("{renewal.total} ر.س");
    expect(form).toContain("ويمكنك إيقافه من «الباقات والاشتراك»");
  });

  it("enrolls only a checkout that showed the notice, also after 3-D Secure", () => {
    expect(form).toContain("enableAutoRenew: Boolean(renewal)");
    expect(form).toContain('renewal ? "&autoRenew=1" : ""');
    expect(success).toContain('searchParams.get("autoRenew") === "1"');
  });
});
