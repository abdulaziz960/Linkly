import { afterEach, describe, expect, it, vi } from "vitest";
import { marketingPage, trackMarketingEvent } from "../lib/marketing-metrics";

afterEach(() => vi.unstubAllGlobals());
describe("privacy-aware marketing measurements", () => {
  it("does not classify private, activation or signup success pages", () => {
    for (const path of ["/dashboard", "/activate", "/signup/success", "/billing", "/login"]) expect(marketingPage(path)).toBeNull();
    expect(marketingPage("/en/solutions/whatsapp-team-inbox")).toBe("solution");
  });
  it("sends only a fixed event and page category after explicit consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/signup", search: "?email=private@example.test" }, gtag });
    vi.stubGlobal("document", { cookie: "linkly_consent=rejected" });
    trackMarketingEvent("trial_created");
    expect(gtag).not.toHaveBeenCalled();
    vi.stubGlobal("document", { cookie: "linkly_consent=accepted" });
    trackMarketingEvent("trial_created");
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "trial_created", { page_category: "signup" });
  });
});
