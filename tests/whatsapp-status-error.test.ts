import { describe, expect, it } from "vitest";
import { describeFailure } from "../lib/campaign-metrics";
import { whatsappStatusErrorText } from "../lib/whatsapp-status-error";

describe("WhatsApp failed-status reason", () => {
  it("keeps Meta's code and details with the title", () => {
    expect(whatsappStatusErrorText([{ code: 131042, title: "Business eligibility payment issue", error_data: { details: "Payment method missing" } }]))
      .toBe("(#131042) Business eligibility payment issue - Payment method missing");
    expect(whatsappStatusErrorText([{ message: "Something" }])).toBe("Something");
    expect(whatsappStatusErrorText(undefined)).toBe("");
  });

  it("shows WhatsApp's own words for a reason the report does not know", () => {
    const why = describeFailure("(#131000) Something went wrong", "966553732841");
    expect(why.key).toBe("other");
    expect(why.text[0]).toContain("(#131000) Something went wrong");
  });
});
