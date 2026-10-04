import { describe, expect, it } from "vitest";
import type { DiscountCodeRow, PlanRow } from "../app/linkly-admin007/types";
import { EMPTY_PLAN_DRAFT, draftFromPlan, planPayload, planStats, validatePlanDraft } from "../app/linkly-admin007/plans/plans-data";
import { EMPTY_CODE_DRAFT, codePayload, codeStats, computeStatus, discountLabel, draftFromCode, filterCodes, parsePlanIds, planNames, sortCodes, validateCodeDraft } from "../app/linkly-admin007/discount-codes/codes-data";
import { UNLIMITED_MESSAGE_QUOTA } from "../lib/message-quota";

const plan = (overrides: Partial<PlanRow>): PlanRow => ({
  id: "p1", name: "باقة", monthlyPrice: 199, employeeLimit: 3, aiDailyLimit: 0, aiMonthlyLimit: 0, allowedChannels: "*", messageQuota: 1000, sortOrder: 1, active: 1, createdAt: "", updatedAt: "", ...overrides
});

describe("plan drafts", () => {
  it("round-trips a plan through the form draft and builds create/edit payloads", () => {
    const draft = draftFromPlan(plan({ allowedChannels: "whatsapp,instagram", messageQuota: UNLIMITED_MESSAGE_QUOTA, aiDailyLimit: 50 }));
    expect(draft.messageUnlimited).toBe(true);
    expect(draft.channels).toEqual(["whatsapp", "instagram"]);
    expect(planPayload(draft, "edit")).toMatchObject({ monthlyPrice: 199, aiDailyLimit: 50, messageQuota: UNLIMITED_MESSAGE_QUOTA, active: true });
    expect(planPayload({ ...draft, name: " باقة جديدة " }, "create")).toMatchObject({ name: "باقة جديدة" });
    expect(planPayload(draft, "edit")).not.toHaveProperty("name");
  });

  it("validates required fields, limits and channel selection", () => {
    expect(validatePlanDraft({ ...EMPTY_PLAN_DRAFT, name: "" }, "create")).toContain("اسم");
    expect(validatePlanDraft({ ...EMPTY_PLAN_DRAFT, name: "x" }, "create")).toBeNull();
    expect(validatePlanDraft({ ...EMPTY_PLAN_DRAFT, employeeLimit: "0" }, "edit")).toContain("حد المستخدمين");
    expect(validatePlanDraft({ ...EMPTY_PLAN_DRAFT, monthlyPrice: "-1" }, "edit")).toContain("السعر");
    expect(validatePlanDraft({ ...EMPTY_PLAN_DRAFT, channels: [] }, "edit")).toContain("قناة");
    expect(validatePlanDraft({ ...EMPTY_PLAN_DRAFT, messageUnlimited: true, messageQuota: "-5" }, "edit")).toBeNull();
  });

  it("computes plan stats", () => {
    const plans = [plan({ id: "a", name: "أ", monthlyPrice: 100 }), plan({ id: "b", name: "ب", monthlyPrice: 300, active: 0 })];
    expect(planStats(plans, { أ: 2, ب: 1 })).toEqual({ total: 2, active: 1, disabled: 1, subscribers: 3, averagePrice: 200 });
  });
});

const NOW = Date.parse("2026-10-04T12:00:00Z");
const code = (overrides: Partial<DiscountCodeRow>): DiscountCodeRow => ({
  id: "c1", name: "ترحيب", code: "WELCOME20", discountType: "percentage", discountValue: 20, maxDiscountAmount: 0, minimumAmount: 0, applicablePlanIds: "[]",
  newUsersOnly: 1, firstSubscriptionOnly: 1, usageLimit: -1, usageLimitPerUser: 1, usedCount: 0, startsAt: "", expiresAt: "", active: 1, createdBy: "", createdAt: "2026-09-30", updatedAt: "", ...overrides
});

describe("discount code status", () => {
  it("derives inactive, scheduled, expired, usage-limit and active", () => {
    expect(computeStatus(code({ active: 0 }), NOW)).toBe("inactive");
    expect(computeStatus(code({ startsAt: "2026-11-01T00:00:00Z" }), NOW)).toBe("scheduled");
    expect(computeStatus(code({ expiresAt: "2026-10-01T00:00:00Z" }), NOW)).toBe("expired");
    expect(computeStatus(code({ usageLimit: 5, usedCount: 5 }), NOW)).toBe("usage_limit_reached");
    expect(computeStatus(code({ usageLimit: 5, usedCount: 4 }), NOW)).toBe("active");
  });

  it("filters, sorts and counts", () => {
    const codes = [
      code({ id: "a", code: "AAA", name: "أ", usedCount: 3, createdAt: "2026-09-01", expiresAt: "2026-12-01T00:00:00Z" }),
      code({ id: "b", code: "BBB", name: "ب", active: 0, usedCount: 9, createdAt: "2026-09-10" }),
      code({ id: "c", code: "CCC", name: "ج", expiresAt: "2026-09-01T00:00:00Z", usedCount: 1, createdAt: "2026-09-20" })
    ];
    expect(filterCodes(codes, "معطل", "", NOW).map((c) => c.id)).toEqual(["b"]);
    expect(filterCodes(codes, "منتهي", "", NOW).map((c) => c.id)).toEqual(["c"]);
    expect(filterCodes(codes, "الكل", "bb", NOW).map((c) => c.id)).toEqual(["b"]);
    expect(sortCodes(codes, "usage").map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(sortCodes(codes, "created").map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(sortCodes(codes, "expiry").map((c) => c.id)).toEqual(["c", "a", "b"]);
    const stats = codeStats(codes, NOW);
    expect(stats).toMatchObject({ total: 3, active: 1, redemptions: 13 });
    expect(stats.counts).toEqual({ الكل: 3, نشط: 1, مجدول: 0, منتهي: 1, معطل: 1 });
  });
});

describe("discount code drafts", () => {
  it("validates value, plans and dates", () => {
    const ok = { ...EMPTY_CODE_DRAFT, name: "ترحيب", code: "WELCOME20", discountValue: "20" };
    expect(validateCodeDraft(ok)).toBeNull();
    expect(validateCodeDraft({ ...ok, discountValue: "150" })).toContain("100");
    expect(validateCodeDraft({ ...ok, discountType: "fixed", discountValue: "150" })).toBeNull();
    expect(validateCodeDraft({ ...ok, discountValue: "0" })).toContain("أكبر من صفر");
    expect(validateCodeDraft({ ...ok, applyToAllPlans: false })).toContain("باقة");
    expect(validateCodeDraft({ ...ok, startsAt: "2026-12-01", expiresAt: "2026-11-01" })).toContain("البداية");
    expect(validateCodeDraft({ ...ok, usageLimit: "2.5" })).toContain("للاستخدام");
  });

  it("round-trips a code and builds the same payload shape the API expects", () => {
    const original = code({ applicablePlanIds: JSON.stringify(["p1", "p2"]), usageLimit: 10, maxDiscountAmount: 50, expiresAt: "2026-12-01T00:00:00.000Z" });
    const draft = draftFromCode(original);
    expect(draft).toMatchObject({ applyToAllPlans: false, selectedPlanIds: ["p1", "p2"], usageLimit: "10", maxDiscountAmount: "50", expiresAt: "2026-12-01" });
    expect(codePayload(draft)).toMatchObject({ applicablePlanIds: ["p1", "p2"], usageLimit: 10, usageLimitPerUser: 1, discountType: "percentage", discountValue: 20 });
    expect(codePayload(draftFromCode(code({}))).usageLimit).toBe(-1);
    expect(codePayload(draftFromCode(code({}))).applicablePlanIds).toEqual([]);
  });

  it("labels discounts and applicable plans", () => {
    const fmt = (n: number) => String(n);
    expect(discountLabel(code({ maxDiscountAmount: 100 }), fmt)).toEqual({ main: "20٪", note: "بحد أقصى 100 ر.س" });
    expect(discountLabel(code({ discountType: "fixed", discountValue: 50 }), fmt)).toEqual({ main: "50 ر.س", note: "مبلغ ثابت" });
    expect(parsePlanIds("not json")).toEqual([]);
    expect(planNames("[]", [])).toBe("كل الباقات");
    expect(planNames(JSON.stringify(["p1"]), [plan({ id: "p1", name: "الباقة العادية" })])).toBe("الباقة العادية");
  });
});
