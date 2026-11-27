import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const form = readFileSync(join(process.cwd(), "app/billing/pay/[paymentId]/MoyasarPayForm.tsx"), "utf-8");

describe("embedded checkout card saving", () => {
  it("asks Moyasar to tokenize the card where the form reads it, for subscriptions only", () => {
    expect(form).toContain('...(kind === "subscription" ? { credit_card: { save_card: true } } : {})');
    expect(form).not.toMatch(/\?\s*\{\s*save_card:/);
  });

  it("still enrolls a card only when the customer ticks the box", () => {
    expect(form).toContain("enableAutoRenew: saveCardRef.current");
    expect(form).toContain("useState(false)");
  });
});
