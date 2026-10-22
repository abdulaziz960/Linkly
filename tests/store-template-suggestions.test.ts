import { describe, expect, it } from "vitest";
import { orderMessageProblem, suggestedOrderMessage, suggestedOrderTemplateName } from "../lib/store-template-suggestions";

const EVENTS = ["created", "processing", "shipped", "delivered", "cancelled"] as const;

describe("store order template suggestions", () => {
  it("every suggestion is valid for Meta and uses all four variables", () => {
    for (const event of EVENTS) expect(orderMessageProblem(suggestedOrderMessage(event))).toBe("");
  });

  it("builds Meta-safe names", () => {
    expect(suggestedOrderTemplateName("salla", "shipped")).toBe("salla_order_shipped");
    expect(suggestedOrderTemplateName("Zid-1", "created")).toBe("zid_1_order_created");
  });

  it("flags missing variables and edge variables", () => {
    expect(orderMessageProblem("")).toMatch(/مطلوب/);
    expect(orderMessageProblem("مرحبًا {{1}} {{2}} {{3}}")).toMatch(/\{\{4\}\}/);
    expect(orderMessageProblem("{{1}} أهلًا {{2}} {{3}} {{4}} تفضل")).toMatch(/يبدأ/);
    expect(orderMessageProblem("أهلًا {{1}} {{2}} {{3}} {{4}}")).toMatch(/ينتهي/);
  });
});

import { cartMessageProblem, suggestedCartMessage, suggestedCartTemplateName } from "../lib/store-template-suggestions";

describe("cart reminder template suggestions", () => {
  it("every suggestion is valid for Meta", () => {
    for (const step of [1, 2, 3] as const) {
      expect(cartMessageProblem(suggestedCartMessage(step, false, false))).toBe("");
      expect(cartMessageProblem(suggestedCartMessage(step, true, false))).toBe("");
      expect(cartMessageProblem(suggestedCartMessage(step, true, true))).toBe("");
    }
  });

  it("only the last reminder with a discount code uses {{4}}", () => {
    expect(suggestedCartMessage(1, false, true)).not.toContain("{{4}}");
    expect(suggestedCartMessage(2, true, false)).not.toContain("{{4}}");
    expect(suggestedCartMessage(2, true, true)).toContain("{{4}}");
  });

  it("names templates per store, step and discount", () => {
    expect(suggestedCartTemplateName("salla", 2, false)).toBe("salla_cart_2");
    expect(suggestedCartTemplateName("zid", 3, true)).toBe("zid_cart_3_discount");
  });

  it("flags missing variables", () => {
    expect(cartMessageProblem("أهلًا {{1}} سلتك {{2}} تابع")).toMatch(/\{\{3\}\}/);
  });
});
