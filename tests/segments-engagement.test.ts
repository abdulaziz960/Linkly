import { describe, expect, it } from "vitest";
import { engagementBucketFor } from "../lib/campaign-engagement";
import { recipientUnsubscribed } from "../lib/segments";
import { buildTemplateComponents } from "../lib/meta-templates";

const base = { status: "تم الإرسال", readAt: "", clickedAt: "", repliedAt: "" };

describe("engagement buckets", () => {
  it("counts a reply as interaction", () => {
    expect(engagementBucketFor({ ...base, readAt: "x", repliedAt: "y" })).toBe("clicked");
    expect(engagementBucketFor({ ...base, readAt: "x" })).toBe("opened");
  });
  it("unsubscribed wins over everything", () => {
    expect(engagementBucketFor({ ...base, clickedAt: "x", unsubscribed: true })).toBe("unsubscribed");
  });
  it("only attributes opt-outs made after the send", () => {
    const map = new Map([["966500000000", "2026-10-02T00:00:00.000Z"]]);
    expect(recipientUnsubscribed(map, "966500000000", "2026-10-01T00:00:00.000Z")).toBe(true);
    expect(recipientUnsubscribed(map, "966500000000", "2026-10-03T00:00:00.000Z")).toBe(false);
  });
});

describe("unsubscribe button", () => {
  const data = { category: "MARKETING", language: "ar", headerType: "NONE", headerText: "", headerMediaHandle: "", message: "hi", footer: "", buttonType: "URL", buttonText: "افتح", buttonPhone: "", buttonUrl: "https://a.sa" };
  it("is appended once to marketing templates", () => {
    const buttons = (buildTemplateComponents(data).find((c) => c.type === "BUTTONS") as any).buttons;
    expect(buttons.map((b: any) => b.text)).toEqual(["افتح", "إلغاء الاشتراك"]);
  });
  it("is not added to utility templates", () => {
    expect(buildTemplateComponents({ ...data, category: "UTILITY", buttonType: "NONE" }).some((c) => c.type === "BUTTONS")).toBe(false);
  });
});

import { checkPhoneNumber, analyzePastedNumbers, analyzeRows } from "../lib/phone-validation";
import { describeFailure } from "../lib/campaign-metrics";

describe("phone validation", () => {
  it("accepts Saudi local and international mobiles and normalises them", () => {
    expect(checkPhoneNumber("0551234567")).toEqual({ ok: true, phone: "966551234567" });
    expect(checkPhoneNumber("+966 55 123 4567")).toEqual({ ok: true, phone: "966551234567" });
    expect(checkPhoneNumber("00971501234567")).toEqual({ ok: true, phone: "971501234567" });
  });
  it("explains why a number is rejected", () => {
    expect(checkPhoneNumber("12345")).toEqual({ ok: false, reason: "too_short" });
    expect(checkPhoneNumber("96655123456")).toEqual({ ok: false, reason: "saudi_incomplete" });
    expect(checkPhoneNumber("96655123456789")).toEqual({ ok: false, reason: "saudi_extra" });
    expect(checkPhoneNumber("966112345678")).toEqual({ ok: false, reason: "saudi_not_mobile" });
    expect(checkPhoneNumber("1234567890123456")).toEqual({ ok: false, reason: "too_long" });
    expect(checkPhoneNumber("abc")).toEqual({ ok: false, reason: "not_a_number" });
  });
  it("splits pasted numbers into accepted, rejected and duplicates", () => {
    const result = analyzePastedNumbers("0551234567\n0551234567\n0559999999, سارة\n96655123\nxyz\n0501111111 0502222222");
    expect(result.valid.map((row) => row.phone)).toEqual(["966551234567", "966559999999", "966501111111", "966502222222"]);
    expect(result.valid[1].name).toBe("سارة");
    expect(result.duplicates).toBe(1);
    expect(result.rejected.map((row) => row.reason)).toEqual(["saudi_incomplete", "not_a_number"]);
  });
  it("skips a header row in a file but reports bad rows", () => {
    const result = analyzeRows([{ line: 1, phone: "الجوال", name: "الاسم" }, { line: 2, phone: "0551234567", name: "" }, { line: 3, phone: "55", name: "" }]);
    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toEqual([{ line: 3, raw: "55", name: "", reason: "too_short" }]);
  });
  it("describes why a number was not messaged", () => {
    expect(describeFailure("", "96655123").key).toBe("badNumber");
    expect(describeFailure("(#131026) Message undeliverable", "966551234567").key).toBe("unregistered");
    expect(describeFailure("ألغى العميل اشتراكه من رسائل الحملات", "966551234567").key).toBe("optedOut");
  });
});
