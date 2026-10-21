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
