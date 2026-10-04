import { describe, expect, it } from "vitest";
import { buildOverview, percentChange, resolveRange } from "../app/linkly-admin007/overview-data";
import { describeAction, parseDetails } from "../app/linkly-admin007/activity";
import type { PaymentRow, SubscriptionRow } from "../app/linkly-admin007/types";

const NOW = new Date("2026-10-15T12:00:00").getTime();
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86_400_000).toISOString();
const day = (offsetDays: number) => iso(offsetDays).slice(0, 10);

function sub(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "s1", tenantId: "t1", companyName: "شركة أ", ownerName: "مالك", ownerEmail: "a@x.sa", plan: "الباقة العادية",
    status: "نشط", employeeLimit: 3, amount: 349, billingCycle: "شهري", renewalAt: day(20), createdAt: iso(-60), updatedAt: iso(-1),
    employeeCount: 2, conversationCount: 10, campaignBalance: 0, ...overrides
  };
}
function pay(overrides: Partial<PaymentRow>): PaymentRow {
  return { id: "p1", tenantId: "t1", companyName: "شركة أ", amount: 349, status: "مكتمل", moyasarId: "m1", paymentUrl: "", createdAt: iso(-2), completedAt: iso(-2), source: "", messages: 0, ...overrides };
}
const base = { logs: [], actions: [], urgentTickets: [], now: NOW };

describe("buildOverview", () => {
  it("separates collected revenue from expected MRR", () => {
    const result = buildOverview({ ...base, subscriptions: [sub({}), sub({ id: "s2", tenantId: "t2", billingCycle: "سنوي", amount: 1200 })], payments: [pay({}), pay({ id: "p2", status: "قيد الانتظار", amount: 500 })] }, resolveRange("30d", NOW));
    expect(result.kpis.collected).toBe(349);
    expect(result.kpis.outstanding).toBe(500);
    expect(result.kpis.mrr).toBe(349 + 100);
    expect(result.kpis.arr).toBe((349 + 100) * 12);
  });

  it("charges seats above the plan limit into MRR", () => {
    const result = buildOverview({ ...base, subscriptions: [sub({ employeeCount: 5, employeeLimit: 3 })], payments: [] }, resolveRange("month", NOW));
    expect(result.kpis.mrr).toBe(349 + 2 * 65);
  });

  it("compares the range with the previous period", () => {
    const range = resolveRange("7d", NOW);
    const result = buildOverview({ ...base, subscriptions: [], payments: [pay({ completedAt: iso(-2) }), pay({ id: "p2", amount: 100, completedAt: iso(-10), createdAt: iso(-10) })] }, range);
    expect(result.kpis.collected).toBe(349);
    expect(result.kpis.collectedPrev).toBe(100);
    expect(percentChange(result.kpis.collected, result.kpis.collectedPrev)).toBeCloseTo(249);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("raises priority actions in severity order", () => {
    const result = buildOverview({
      ...base,
      subscriptions: [sub({ tenantId: "late", companyName: "متأخر", renewalAt: day(-3) }), sub({ id: "s3", tenantId: "soon", companyName: "قريب", renewalAt: day(3) }), sub({ id: "s4", tenantId: "idle", companyName: "خامل", conversationCount: 0, createdAt: iso(-20) })],
      payments: [pay({ id: "pf", status: "فشل", completedAt: "", createdAt: iso(-1), failureReason: "رصيد غير كاف" })],
      urgentTickets: [{ id: "tk", ticketNumber: "T-1", subject: "عطل", companyName: "قريب", tenantId: "soon", createdAt: iso(-1), status: "new" }]
    }, resolveRange("30d", NOW));
    const levels = result.priorities.map((item) => item.level);
    expect(levels).toEqual([...levels].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a] - ({ high: 0, medium: 1, low: 2 })[b]));
    expect(result.priorities.some((item) => item.id === "overdue-late")).toBe(true);
    expect(result.priorities.some((item) => item.id === "renew-soon")).toBe(true);
    expect(result.priorities.some((item) => item.id === "failed-pf")).toBe(true);
    expect(result.priorities.some((item) => item.id === "ticket-tk")).toBe(true);
    expect(result.priorities.some((item) => item.id === "idle-idle")).toBe(true);
  });

  it("has no priority actions for a healthy account", () => {
    const result = buildOverview({ ...base, subscriptions: [sub({})], payments: [pay({})] }, resolveRange("30d", NOW));
    expect(result.priorities).toEqual([]);
  });

  it("keeps collected revenue to past months and expected revenue to current and future months", () => {
    const result = buildOverview({ ...base, subscriptions: [sub({})], payments: [pay({})] }, resolveRange("30d", NOW));
    expect(result.revenue.collected.slice(6).every((value) => value === null)).toBe(true);
    expect(result.revenue.expected.slice(0, 5).every((value) => value === null)).toBe(true);
    expect(result.revenue.expected[5]).toBe(349);
  });
});

describe("describeAction", () => {
  it("turns an action key into an Arabic sentence", () => {
    const view = describeAction({ id: "1", adminUserId: "u", adminEmail: "sara@linkly.sa", adminName: "سارة", action: "create-plan", targetType: "plan", targetId: "p", details: JSON.stringify({ name: "باقة جديدة", monthlyPrice: 299 }), createdAt: iso(-1) });
    expect(view.title).toBe("أنشأ سارة باقة جديدة");
    expect(view.details).toEqual([{ label: "الاسم", value: "باقة جديدة" }, { label: "السعر الشهري", value: "299" }]);
    expect(view.technicalId).toBe("create-plan");
  });

  it("never exposes secrets and falls back for unknown actions", () => {
    const view = describeAction({ id: "2", adminUserId: "u", adminEmail: "x@y.sa", adminName: "", action: "something.new", targetType: "", targetId: "", details: JSON.stringify({ apiKey: "sk_live_123", token: "abc", name: "اسم" }), createdAt: iso(-1) });
    expect(JSON.stringify(view)).not.toContain("sk_live_123");
    expect(JSON.stringify(view)).not.toContain("abc");
    expect(view.title).toContain("إجراءً إداريًا");
  });

  it("keeps plain-text details as a note and never throws on bad JSON", () => {
    expect(parseDetails("تغيير الحالة إلى مغلقة")).toEqual([{ label: "ملاحظة", value: "تغيير الحالة إلى مغلقة" }]);
    expect(parseDetails("")).toEqual([]);
  });
});
