import { describe, expect, it } from "vitest";
import { whatsappBillingUrl } from "../lib/whatsapp-billing";

describe("whatsappBillingUrl", () => {
  it("points at the workspace's own WhatsApp account and business", () => {
    const url = new URL(whatsappBillingUrl({ wabaId: "499103886619083", businessId: "2486788041587703" }));
    expect(url.origin + url.pathname).toBe("https://business.facebook.com/latest/billing_hub/accounts/details/");
    expect(url.searchParams.get("asset_id")).toBe("499103886619083");
    expect(url.searchParams.get("business_id")).toBe("2486788041587703");
    expect(url.searchParams.get("placement")).toBe("whatsapp_ads");
  });

  it("drops ids that are not numeric (a business name was stored instead of an id)", () => {
    const url = new URL(whatsappBillingUrl({ wabaId: "499103886619083", businessId: "شركة الأمل" }));
    expect(url.searchParams.has("business_id")).toBe(false);
    expect(url.searchParams.get("asset_id")).toBe("499103886619083");
  });
});
