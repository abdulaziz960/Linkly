import { describe, expect, it } from "vitest";
import { changeDetails } from "../lib/admin-audit";
import { describeAction, parseDetails } from "../app/linkly-admin007/activity";
import { parseDetails as parseActionDetails } from "../app/linkly-admin007/admin-actions/actions-data";

describe("changeDetails", () => {
  it("records only the fields that changed, with previous and new values", () => {
    const details = JSON.parse(changeDetails({ monthlyPrice: 249, employeeLimit: 3, active: 1 }, { monthlyPrice: 299, employeeLimit: 3, active: true }, "باقة النمو"));
    expect(details).toEqual({ subject: "باقة النمو", before: { monthlyPrice: 249 }, after: { monthlyPrice: 299 } });
  });

  it("treats booleans and 0/1 as the same value", () => {
    const details = JSON.parse(changeDetails({ active: 1 }, { active: false }));
    expect(details.before).toEqual({ active: 1 });
    expect(details.after).toEqual({ active: 0 });
  });

  it("never records secret-looking fields", () => {
    const text = changeDetails({ name: "a" }, { name: "b", apiKey: "sk_live_1", accessToken: "t" });
    expect(text).not.toContain("sk_live_1");
    expect(text).not.toContain("accessToken");
    expect(text).toContain('"after":{"name":"b"}');
  });

  it("falls back to the submitted patch when nothing changed", () => {
    expect(JSON.parse(changeDetails({ plan: "x" }, { plan: "x" }, "عميل"))).toEqual({ subject: "عميل", plan: "x" });
  });

  it("joins array values so they stay readable", () => {
    const details = JSON.parse(changeDetails({ applicablePlanIds: ["a"] }, { applicablePlanIds: ["a", "b"] }));
    expect(details.after.applicablePlanIds).toBe("a، b");
  });
});

describe("audit display of before/after", () => {
  const stored = changeDetails({ monthlyPrice: 249 }, { monthlyPrice: 299 }, "باقة النمو");

  it("shows previous values and the subject in the activity feed", () => {
    const view = describeAction({ id: "1", adminUserId: "u", adminEmail: "a@x.sa", adminName: "سارة", action: "update-plan", targetType: "plan", targetId: "p", details: stored, createdAt: new Date().toISOString() });
    expect(view.target).toBe("باقة النمو");
    expect(view.details).toEqual([{ label: "السعر الشهري", value: "299", previous: "249" }]);
  });

  it("parses the same format for the audit-log page without dumping raw JSON", () => {
    expect(parseActionDetails(stored)).toEqual([["السعر الشهري", "299", "249"]]);
    expect(parseActionDetails(JSON.stringify({ nested: { a: 1 } }))).toEqual([["nested", "—"]]);
    expect(parseDetails(JSON.stringify({ nested: { a: 1 } }))).toEqual([]);
  });
});
