import { describe, expect, it } from "vitest";
import { evaluateEmailUsage } from "../lib/email-usage";

describe("evaluateEmailUsage", () => {
  it("is ok well under the limits", () => expect(evaluateEmailUsage(10, 200, 100, 3000).level).toBe("ok"));
  it("warns at 80% of the daily limit", () => expect(evaluateEmailUsage(80, 200, 100, 3000).level).toBe("warn"));
  it("warns at 80% of the monthly limit", () => expect(evaluateEmailUsage(5, 2400, 100, 3000).level).toBe("warn"));
  it("reports the limit once reached", () => expect(evaluateEmailUsage(100, 200, 100, 3000).level).toBe("limit"));
});
