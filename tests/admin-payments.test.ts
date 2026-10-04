import { describe, expect, it } from "vitest";
import type { PaymentRow } from "../app/linkly-admin007/types";
import { EMPTY_FILTERS, filterPayments, normalizeStatusParam, paymentStats, sortPayments, statusCounts, visibleTotals } from "../app/linkly-admin007/payments/payments-data";

const day = 86_400_000;
const NOW = Date.parse("2026-10-04T12:00:00Z");
const at = (daysAgo: number) => new Date(NOW - daysAgo * day).toISOString();

function pay(id: string, overrides: Partial<PaymentRow>): PaymentRow {
  return { id, tenantId: "t1", companyName: "شركة", amount: 100, status: "مكتمل", moyasarId: `m-${id}`, paymentUrl: "", createdAt: at(1), completedAt: "", source: "اشتراك", messages: 0, ...overrides };
}

const rows = [
  pay("a", { amount: 599, status: "مكتمل", createdAt: at(2) }),
  pay("b", { amount: 599, status: "فشل", createdAt: at(3) }),
  pay("c", { amount: 150, status: "قيد الانتظار", createdAt: at(10), source: "شحن رسائل حملات", tenantId: "t2", companyName: "عيادات" }),
  pay("d", { amount: 150, status: "قيد الانتظار", createdAt: at(1) }),
  pay("e", { amount: 150, status: "منتهي الصلاحية", createdAt: at(20) }),
  pay("f", { amount: 80, status: "مسترد", createdAt: at(30) })
];

describe("paymentStats", () => {
  it("collects only completed payments; pending is outstanding and old pending is overdue", () => {
    const stats = paymentStats(rows, NOW);
    expect(stats.collected).toBe(599);
    expect(stats.outstanding).toBe(300);
    expect(stats.pendingCount).toBe(2);
    expect(stats.overdueCount).toBe(1);
    expect(stats.failedCount).toBe(1);
    expect(stats.refundedTotal).toBe(80);
  });
});

describe("visibleTotals", () => {
  it("totals only the completed rows among those shown (failed/expired never count)", () => {
    expect(visibleTotals(rows)).toEqual({ collected: 599, completedCount: 1, count: 6 });
    expect(visibleTotals(rows.filter((row) => row.status !== "مكتمل"))).toEqual({ collected: 0, completedCount: 0, count: 5 });
  });
});

describe("filterPayments", () => {
  it("filters by client, status, source and search", () => {
    expect(filterPayments(rows, { ...EMPTY_FILTERS, client: "t2" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterPayments(rows, { ...EMPTY_FILTERS, status: "قيد الانتظار" }).map((row) => row.id)).toEqual(["c", "d"]);
    expect(filterPayments(rows, { ...EMPTY_FILTERS, source: "شحن رسائل حملات" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterPayments(rows, { ...EMPTY_FILTERS, query: "M-E" }).map((row) => row.id)).toEqual(["e"]);
    expect(filterPayments(rows, { ...EMPTY_FILTERS, query: "عيادات" }).map((row) => row.id)).toEqual(["c"]);
  });

  it("filters by amount range and date range", () => {
    expect(filterPayments(rows, { ...EMPTY_FILTERS, min: "500" }).map((row) => row.id)).toEqual(["a", "b"]);
    expect(filterPayments(rows, { ...EMPTY_FILTERS, max: "100" }).map((row) => row.id)).toEqual(["f"]);
    expect(filterPayments(rows, { ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-10-03" }).map((row) => row.id)).toEqual(["a", "b", "d"]);
  });
});

describe("sortPayments", () => {
  it("orders by recency or amount without mutating the input", () => {
    const before = rows.map((row) => row.id);
    expect(sortPayments(rows, "recent").map((row) => row.id)).toEqual(["d", "a", "b", "c", "e", "f"]);
    expect(sortPayments(rows, "oldest").map((row) => row.id)).toEqual(["f", "e", "c", "b", "a", "d"]);
    expect(sortPayments(rows, "amount_asc")[0].id).toBe("f");
    expect(sortPayments(rows, "amount_desc")[0].amount).toBe(599);
    expect(rows.map((row) => row.id)).toEqual(before);
  });
});

describe("helpers", () => {
  it("maps legacy status params and counts per status", () => {
    expect(normalizeStatusParam("pending")).toBe("قيد الانتظار");
    expect(normalizeStatusParam("completed")).toBe("مكتمل");
    expect(normalizeStatusParam("فشل")).toBe("فشل");
    expect(normalizeStatusParam("nonsense")).toBe("الكل");
    expect(statusCounts(rows)).toMatchObject({ الكل: 6, مكتمل: 1, "قيد الانتظار": 2, فشل: 1, "منتهي الصلاحية": 1, مسترد: 1 });
  });
});
