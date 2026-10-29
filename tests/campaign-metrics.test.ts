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
  // The numbers of a real report: 2,774 recipients, 1,195 read, 439 not received, 1,140 with no receipt.
  const report = computeCampaignStats({
    total: 2781,
    readCount: 1195,
    // rows with no read proof: 1,572 accepted (432 later undeliverable) and 7 that failed at send time
    statusCounts: [{ status: "تم الإرسال", count: 1572 }, { status: "فشل الإرسال", count: 7 }],
    deliveryFailedCount: 432,
    deliveredCount: 0,
    failureErrors: [{ error: "(#131026) Message undeliverable", count: 7 }]
  });

  it("splits the audience into places that add up, and agrees with the report", () => {
    expect(report.total).toBe(2774);
    expect(report.read).toBe(1195);
    expect(report.failed).toBe(439);
    expect(report.unconfirmed).toBe(1140);
    expect(report.sent).toBe(2767);
    expect(report.pending).toBe(0);
    // read + failed + unconfirmed (+ delivered-unread) = every recipient
    expect(report.read + report.failed + report.unconfirmed + report.optedOut + report.pending).toBe(report.total);
  });

  it("takes the audience from the recipient rows, not from a stored counter that drifted", () => {
    expect(report.total).not.toBe(2781);
    expect(computeCampaignStats({ total: 50, statusCounts: [] }).total).toBe(50);
  });

  it("counts a read recipient as received even when a failure was recorded", () => {
    // The row carries a read receipt, so it is in readCount and nowhere else.
    const stats = computeCampaignStats({ total: 3, readCount: 1, statusCounts: [{ status: "تم الإرسال", count: 2 }], deliveryFailedCount: 1 });
    expect(stats.read).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.unconfirmed).toBe(1);
    expect(stats.sent).toBe(3);
  });

  it("is complete only when nothing is waiting", () => {
    expect(report.complete).toBe(true);
    const running = computeCampaignStats({ total: 10, statusCounts: [{ status: "تم الإرسال", count: 6 }, { status: "قيد الإرسال", count: 3 }, { status: "جارٍ الإرسال", count: 1 }] });
    expect(running.pending).toBe(4);
    expect(running.complete).toBe(false);
    expect(computeCampaignStats({ total: 0, statusCounts: [] }).complete).toBe(false);
  });

  it("keeps the funnel ordered: sent >= delivered >= read >= replied", () => {
    const stats = computeCampaignStats({ total: 10, readCount: 3, statusCounts: [{ status: "تم الإرسال", count: 7 }], deliveredCount: 4, repliedCount: 2 });
    expect(stats.sent).toBe(10);
    expect(stats.delivered).toBe(7);
    expect(stats.read).toBe(3);
    expect(stats.replied).toBe(2);
    expect(stats.unconfirmed).toBe(3);
    expect(stats.sent).toBeGreaterThanOrEqual(stats.delivered);
    expect(stats.delivered).toBeGreaterThanOrEqual(stats.read);
  });

  it("removes accepted-then-undeliverable messages from delivered and adds them to failed", () => {
    const stats = computeCampaignStats({ total: 10, statusCounts: [{ status: "تم الإرسال", count: 10 }], deliveredCount: 6, deliveryFailedCount: 4 });
    expect(stats.delivered).toBe(6);
    expect(stats.failed).toBe(4);
    expect(stats.unconfirmed).toBe(0);
    // No reason was recorded for them, so none is invented.
    expect(stats.failureReasons[0]).toEqual({ key: "other", count: 4 });
  });

  it("explains accepted-then-undeliverable messages with the reason WhatsApp gave", () => {
    const stats = computeCampaignStats({
      total: 10,
      statusCounts: [{ status: "تم الإرسال", count: 10 }],
      deliveryFailedCount: 10,
      deliveryFailureErrors: [
        { error: "This message was not delivered to maintain healthy ecosystem engagement.", count: 7 },
        { error: "(#131050) User has stopped marketing messages", count: 2 },
        { error: "", count: 1 }
      ]
    });
    expect(stats.failureReasons).toEqual([{ key: "meta_limit", count: 7 }, { key: "recipient_blocked", count: 2 }, { key: "other", count: 1 }]);
  });

  it("keeps opt-outs apart from failures", () => {
    const stats = computeCampaignStats({ total: 4, statusCounts: [{ status: "فشل الإرسال", count: 4 }], failureErrors: [{ error: OPT_OUT_ERROR, count: 3 }, { error: "(#131026) Message undeliverable", count: 1 }] });
    expect(stats.optedOut).toBe(3);
    expect(stats.failed).toBe(1);
    expect(stats.failureReasons).toEqual([{ key: "unregistered", count: 1 }]);
  });

  it("groups failure reasons", () => {
    expect(classifyFailure("الرصيد غير كافٍ")).toBe("insufficient_balance");
    expect(classifyFailure("(#131047) Re-engagement message")).toBe("outside_window");
    expect(classifyFailure("something odd")).toBe("other");
  });

  it("adds campaigns up for the page-level cards", () => {
    const total = sumCampaignStats([report, computeCampaignStats({ total: 10, statusCounts: [{ status: "تم الإرسال", count: 4 }, { status: "قيد الإرسال", count: 6 }] })]);
    expect(total.total).toBe(2784);
    expect(total.pending).toBe(6);
    expect(total.unconfirmed).toBe(1144);
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


describe("distinct provider failure reasons", () => {
  it("keeps marketing limits, experiments, throughput and unsupported types separate", () => {
    expect(classifyFailure("(#131049) healthy ecosystem")).toBe("meta_limit");
    expect(classifyFailure("(#130429) rate limit")).toBe("rate_limit");
    expect(classifyFailure("(#131056) too many messages")).toBe("rate_limit");
    expect(classifyFailure("(#130472) experiment")).toBe("meta_experiment");
    expect(classifyFailure("(#131051) unsupported message type")).toBe("rejected");
    expect(classifyFailure("(#131047) outside window")).toBe("outside_window");
  });
});
