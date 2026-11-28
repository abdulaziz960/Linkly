import { describe, expect, it } from "vitest";
import { requiresCampaignLinkTracking, trackingButtonUrl } from "../lib/campaign-validation";

describe("template tracking-link button", () => {
  it("always points at Linkly's redirect, never appended to the business's own page", () => {
    expect(trackingButtonUrl("")).toBe("https://linklysa.io/api/campaigns/t/{{1}}");
    expect(trackingButtonUrl("https://app.example.test/")).toBe("https://app.example.test/api/campaigns/t/{{1}}");
    expect(requiresCampaignLinkTracking({ buttonType: "URL", buttonUrl: trackingButtonUrl("") })).toBe(true);
  });
});
