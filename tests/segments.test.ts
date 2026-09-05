import { describe, expect, it } from "vitest";
import { isCustomerInactive, matchesAnyTag } from "../lib/segments";

describe("matchesAnyTag", () => {
  it("matches when no tag filter is set", () => {
    expect(matchesAnyTag([], [])).toBe(true);
    expect(matchesAnyTag(["متابعة لاحقة"], [])).toBe(true);
  });

  it("matches when the customer has at least one of the filter tags", () => {
    expect(matchesAnyTag(["متابعة لاحقة", "شكوى"], ["شكوى"])).toBe(true);
  });

  it("does not match when none of the filter tags are present", () => {
    expect(matchesAnyTag(["شحن"], ["متابعة لاحقة"])).toBe(false);
  });
});

describe("isCustomerInactive", () => {
  const now = new Date("2026-09-05T00:00:00.000Z");

  it("treats a customer who never had activity as inactive", () => {
    expect(isCustomerInactive("", 30, now)).toBe(true);
  });

  it("treats an old timestamp beyond the threshold as inactive", () => {
    expect(isCustomerInactive("2026-07-01T00:00:00.000Z", 30, now)).toBe(true);
  });

  it("treats a recent timestamp within the threshold as active", () => {
    expect(isCustomerInactive("2026-09-01T00:00:00.000Z", 30, now)).toBe(false);
  });
});
