import { describe, expect, it } from "vitest";
import { engagementBucketFor } from "../lib/campaign-engagement";

const base = { status: "تم الإرسال", readAt: "", clickedAt: "", deliveryFailed: 0 };

describe("campaign engagement bucket", () => {
  it("classifies sent recipients by what the customer did", () => {
    expect(engagementBucketFor(base)).toBe("notOpened");
    expect(engagementBucketFor({ ...base, readAt: "2026-10-01T10:00:00Z" })).toBe("opened");
    expect(engagementBucketFor({ ...base, readAt: "2026-10-01T10:00:00Z", clickedAt: "2026-10-01T10:05:00Z" })).toBe("clicked");
  });

  it("counts a failed send or a failed delivery status as not received", () => {
    expect(engagementBucketFor({ ...base, status: "فشل الإرسال" })).toBe("notReceived");
    expect(engagementBucketFor({ ...base, deliveryFailed: 1 })).toBe("notReceived");
  });

  it("treats a read receipt or click as proof of receipt even if a failure flag is set", () => {
    expect(engagementBucketFor({ ...base, deliveryFailed: 1, readAt: "2026-10-01T10:00:00Z" })).toBe("opened");
    expect(engagementBucketFor({ ...base, deliveryFailed: 1, clickedAt: "2026-10-01T10:05:00Z" })).toBe("clicked");
  });

  it("leaves an in-progress send unclassified", () => {
    expect(engagementBucketFor({ ...base, status: "قيد الإرسال" })).toBeNull();
  });
});
