import { describe, expect, it } from "vitest";
import { mapVerificationStatus, securityCenterUrl } from "../lib/business-verification";

describe("business verification", () => {
  it("maps Meta statuses", () => {
    expect(mapVerificationStatus("verified")).toBe("verified");
    expect(mapVerificationStatus("pending")).toBe("pending");
    expect(mapVerificationStatus("rejected")).toBe("rejected");
    expect(mapVerificationStatus("not_verified")).toBe("not_verified");
    expect(mapVerificationStatus(undefined)).toBe("unknown");
  });
  it("builds the security center link", () => {
    expect(securityCenterUrl("123")).toContain("business_id=123");
    expect(securityCenterUrl("")).toBe("https://business.facebook.com/settings/security");
  });
});
