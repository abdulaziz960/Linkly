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
