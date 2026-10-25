import { describe, expect, it } from "vitest";
import {
  OPT_OUT_ERROR,
  campaignCost,
  classifyFailure,
  computeCampaignStats,
  effectiveMessageRate,
  formatRate,
  sumCampaignStats
} from "../lib/campaign-metrics";

describe("send rate", () => {
  it("shows one decimal and never rounds up to 100%", () => {
    expect(formatRate(2774, 2781)).toBe(99.7);
    expect(formatRate(2781, 2781)).toBe(100);
    expect(formatRate(0, 10)).toBe(0);
    expect(formatRate(5, 0)).toBe(0);
    expect(formatRate(999, 1000)).toBe(99.9);
  });
});

describe("campaign stats", () => {
  const completed = computeCampaignStats({
    total: 2781,
    statusCounts: [{ status: "تم الإرسال", count: 2774 }, { status: "فشل الإرسال", count: 7 }],
    deliveredCount: 2600,
    readCount: 1200,
    repliedCount: 90,
    failureErrors: [{ error: "(#131026) Message undeliverable", count: 5 }, { error: OPT_OUT_ERROR, count: 2 }]
  });

  it("counts failed recipients as failed, not pending", () => {
    expect(completed.pending).toBe(0);
    expect(completed.failed).toBe(5);
    expect(completed.optedOut).toBe(2);
    expect(completed.sent).toBe(2774);
    expect(completed.sent + completed.failed + completed.optedOut + completed.pending).toBe(2781);
    expect(completed.sendRate).toBe(99.7);
  });

  it("is complete only when nothing is waiting", () => {
    expect(completed.complete).toBe(true);
    const running = computeCampaignStats({ total: 10, statusCounts: [{ status: "تم الإرسال", count: 6 }, { status: "قيد الإرسال", count: 3 }, { status: "جارٍ الإرسال", count: 1 }] });
    expect(running.pending).toBe(4);
    expect(running.complete).toBe(false);
    expect(computeCampaignStats({ total: 0, statusCounts: [] }).complete).toBe(false);
  });

  it("keeps the funnel ordered: sent >= delivered >= read >= replied", () => {
    expect(completed.delivered).toBe(2600);
    expect(completed.read).toBe(1200);
    expect(completed.replied).toBe(90);
    const odd = computeCampaignStats({ total: 10, statusCounts: [{ status: "تم الإرسال", count: 10 }], deliveredCount: 3, readCount: 5, deliveryFailedCount: 2 });
    expect(odd.delivered).toBeGreaterThanOrEqual(odd.read);
    expect(odd.failed).toBe(2);
  });

  it("removes accepted-then-undeliverable messages from delivered and adds them to failed", () => {
    const stats = computeCampaignStats({ total: 10, statusCounts: [{ status: "تم الإرسال", count: 10 }], deliveredCount: 10, deliveryFailedCount: 4 });
    expect(stats.delivered).toBe(6);
    expect(stats.failed).toBe(4);
    expect(stats.failureReasons[0]).toEqual({ key: "recipient_blocked", count: 4 });
  });

  it("groups failure reasons", () => {
    expect(completed.failureReasons).toEqual([{ key: "unregistered", count: 5 }]);
    expect(classifyFailure("الرصيد غير كافٍ")).toBe("insufficient_balance");
    expect(classifyFailure("(#131047) Re-engagement message")).toBe("outside_window");
    expect(classifyFailure("something odd")).toBe("other");
  });

  it("adds campaigns up for the page-level cards", () => {
    const total = sumCampaignStats([completed, computeCampaignStats({ total: 10, statusCounts: [{ status: "تم الإرسال", count: 4 }, { status: "قيد الإرسال", count: 6 }] })]);
    expect(total.total).toBe(2791);
    expect(total.sent).toBe(2778);
    expect(total.pending).toBe(6);
    expect(total.complete).toBe(false);
  });
});

describe("cost", () => {
  it("uses what the workspace really paid per message", () => {
    const rate = effectiveMessageRate([
      { messages: 1000, amount: 20, status: "مكتمل" },
      { messages: 4000, amount: 60, status: "مكتمل" },
      { messages: 9999, amount: 1, status: "قيد الانتظار" }
    ], 0.02);
    expect(rate).toBeCloseTo(0.016, 6);
    expect(campaignCost(2774, rate)).toBe(44.38);
  });

  it("falls back when there is no completed top-up", () => {
    expect(effectiveMessageRate([], 0.02)).toBe(0.02);
  });
});
