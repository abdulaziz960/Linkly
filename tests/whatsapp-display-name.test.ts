import { describe, expect, it } from "vitest";
import { displayNameProblem, mapNameStatus } from "../lib/whatsapp-display-name";

describe("whatsapp display name", () => {
  it("maps Meta statuses", () => {
    expect(mapNameStatus("APPROVED")).toBe("approved");
    expect(mapNameStatus("AVAILABLE_WITHOUT_REVIEW")).toBe("approved");
    expect(mapNameStatus("PENDING_REVIEW")).toBe("pending");
    expect(mapNameStatus("DECLINED")).toBe("declined");
    expect(mapNameStatus("EXPIRED")).toBe("expired");
    expect(mapNameStatus(undefined)).toBe("none");
  });

  it("validates names before sending to Meta", () => {
    expect(displayNameProblem("شركة حسين بن جبران للسيارات")).toBe("");
    expect(displayNameProblem("ab")).not.toBe("");
    expect(displayNameProblem("متجر 😀")).not.toBe("");
    expect(displayNameProblem("www.shop.com")).not.toBe("");
    expect(displayNameProblem("12345")).not.toBe("");
    expect(displayNameProblem("a".repeat(80))).not.toBe("");
  });
});
