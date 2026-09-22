import { afterEach, describe, expect, it, vi } from "vitest";
import { clipUtf8, managedMonthlyRequestCap } from "../lib/ai-economy";

afterEach(() => vi.unstubAllEnvs());
describe("managed AI budget policy", () => {
  it("defaults to 2000 conservative reservations per month", () => {
    vi.stubEnv("AI_MANAGED_BUDGET_SAR", "");
    expect(managedMonthlyRequestCap()).toBe(2000);
  });
  it.each(["0", "-1", "51", "NaN", "Infinity"])("fails closed for %s", (value) => {
    vi.stubEnv("AI_MANAGED_BUDGET_SAR", value);
    expect(managedMonthlyRequestCap()).toBe(0);
  });
  it("allows a smaller platform allowance", () => {
    vi.stubEnv("AI_MANAGED_BUDGET_SAR", "0.025");
    expect(managedMonthlyRequestCap()).toBe(1);
  });
  it("clips Arabic and emoji on Unicode character boundaries", () => {
    expect(clipUtf8("مرحبا", 4)).toBe("مر");
    expect(clipUtf8("😀a", 3)).toBe("");
    expect(clipUtf8("😀a", 4)).toBe("😀");
  });
});
