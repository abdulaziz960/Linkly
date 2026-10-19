import { describe, expect, it } from "vitest";
import { buildTrackingMessage, cleanTrackingInput, parseTrackRequest } from "../lib/order-tracking";

describe("order tracking", () => {
  it("requires a number or link when shipped", () => {
    expect(cleanTrackingInput({ stage: "shipped" }).ok).toBe(false);
    expect(cleanTrackingInput({ stage: "shipped", trackingNumber: "123" }).ok).toBe(true);
    expect(cleanTrackingInput({ stage: "preparing" }).ok).toBe(true);
  });
  it("rejects bad stages and non-http links", () => {
    expect(cleanTrackingInput({ stage: "lost" }).ok).toBe(false);
    expect(cleanTrackingInput({ stage: "shipped", trackingNumber: "1", trackingUrl: "javascript:alert(1)" }).ok).toBe(false);
  });
  it("builds the customer message", () => {
    const text = buildTrackingMessage("ord-cf449cc2-aaaa", { stage: "shipped", carrier: "سمسا", trackingNumber: "99", trackingUrl: "" });
    expect(text).toContain("ORD-CF449CC2");
    expect(text).toContain("تم الشحن");
    expect(text).toContain("رقم الشحنة: 99");
  });
  it("parses track requests", () => {
    expect(parseTrackRequest("تتبع طلبي")).toEqual({ match: true, number: "" });
    expect(parseTrackRequest("تتبع ORD-CF449CC2")).toEqual({ match: true, number: "ORDCF449CC2" });
    expect(parseTrackRequest("أبي أتتبع شي ثاني")).toEqual({ match: false, number: "" });
  });
});
