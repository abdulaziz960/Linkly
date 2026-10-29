import { describe, expect, it } from "vitest";
import { campaignOutcomePresentation, computeCampaignStats } from "../lib/campaign-metrics";

describe("campaign completion is not send success", () => {
  it("labels the 0/804 campaign as failed instead of green completed", () => {
    const stats = computeCampaignStats({ total: 804, statusCounts: [{ status: "فشل الإرسال", count: 804 }] });
    expect(campaignOutcomePresentation("الحملة أنجزت", stats)).toEqual({ label: ["فشل الإرسال", "Sending failed"], tone: "off" });
    expect(stats.sendRate).toBe(0);
  });
  it("keeps 2774/2781 at 99.7% while exposing partial failure", () => {
    const stats = computeCampaignStats({ total: 2781, statusCounts: [{ status: "تم الإرسال", count: 2774 }, { status: "فشل الإرسال", count: 7 }] });
    expect(stats.sendRate).toBe(99.7);
    expect(campaignOutcomePresentation("الحملة أنجزت", stats).tone).toBe("warn");
  });
  it("does not imply delivery when every send was accepted but has no receipt", () => {
    const stats = computeCampaignStats({ total: 804, statusCounts: [{ status: "تم الإرسال", count: 804 }] });
    expect(campaignOutcomePresentation("الحملة أنجزت", stats).label).toEqual(["انتهت المعالجة", "Processing finished"]);
    expect(stats.delivered).toBe(0);
  });
  it("shows asynchronous delivery failure even when the send rate is 100%", () => {
    const stats = computeCampaignStats({ total: 804, statusCounts: [{ status: "تم الإرسال", count: 804 }], deliveryFailedCount: 12 });
    expect(stats.sendRate).toBe(100);
    expect(campaignOutcomePresentation("الحملة أنجزت", stats).tone).toBe("warn");
  });
  it("does not override cancelled or scheduled campaigns with an outcome", () => {
    const stats = computeCampaignStats({ total: 804, statusCounts: [{ status: "قيد الإرسال", count: 804 }] });
    expect(campaignOutcomePresentation("ملغاة", stats).label[0]).toBe("ملغاة");
    expect(campaignOutcomePresentation("مجدولة", stats).label[0]).toBe("مجدولة");
  });
});

describe("tracking requirements", () => {
  it("rejects recurring dynamic links before a recurring campaign can be saved", async () => {
    const { campaignLinkTrackingIssue } = await import("../lib/campaign-validation");
    expect(campaignLinkTrackingIssue({ buttonType: "URL", buttonUrl: "https://example.com/{{1}}" }, { enabled: false, destinationUrl: "", recurring: true })?.ar).toContain("المتكررة");
  });
  it("requires a destination after enabling dynamic-link tracking", async () => {
    const { campaignLinkTrackingIssue } = await import("../lib/campaign-validation");
    expect(campaignLinkTrackingIssue({ buttonType: "URL", buttonUrl: "https://example.com/{{ 1 }}" }, { enabled: true, destinationUrl: "" })).not.toBeNull();
  });
});
