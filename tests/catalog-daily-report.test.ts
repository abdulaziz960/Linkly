import { describe, expect, it } from "vitest";
import { buildDailyReport, dayRange, isValidDay, todayInRiyadh } from "../lib/catalog-daily-report";
import type { CatalogOrderRow } from "../lib/catalog";

function order(partial: Partial<CatalogOrderRow> & { id: string; total: number; status: CatalogOrderRow["status"] }): CatalogOrderRow {
  return { conversationId: "c", customerName: "سارة", customerPhone: "966500000000", productId: "p", productName: "قهوة", unitPrice: partial.total, quantity: 1, currency: "SAR", paymentUrl: "", createdAt: "2026-01-10T09:00:00.000Z", updatedAt: "2026-01-10T09:00:00.000Z", ...partial } as CatalogOrderRow;
}

describe("daily closing report", () => {
  it("uses the Saudi calendar day", () => {
    expect(dayRange("2026-01-10")).toEqual({ from: "2026-01-09T21:00:00.000Z", to: "2026-01-10T21:00:00.000Z" });
    expect(todayInRiyadh(new Date("2026-01-10T22:00:00Z"))).toBe("2026-01-11"); // 01:00 there
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("نص")).toBe(false);
  });

  it("totals what counts as sales, keeps unpaid and cancelled apart, and breaks it down", () => {
    const orders = [
      order({ id: "ORD-1", total: 100, status: "paid", branchName: "الشمال", pickup: { kind: "car", plate: "x", carDetails: "" }, items: [{ productId: "a", productName: "برجر", unitPrice: 50, quantity: 2 }] }),
      order({ id: "ORD-2", total: 35, status: "fulfilled", branchName: "الجنوب", shipping: { methodName: "سريع", city: "الرياض", address: "", fee: 10, eta: "" }, discount: { code: "W", amount: 5 }, items: [{ productId: "a", productName: "برجر", unitPrice: 25, quantity: 1 }, { productId: "b", productName: "بطاطس", unitPrice: 10, quantity: 1 }] }),
      order({ id: "ORD-3", total: 20, status: "new", branchName: "الشمال", pickup: { kind: "store", plate: "", carDetails: "" } }),
      order({ id: "ORD-4", total: 40, status: "awaiting_payment" }),
      order({ id: "ORD-5", total: 15, status: "cancelled" })
    ];
    const report = buildDailyReport("2026-01-10", orders);
    expect(report.orderCount).toBe(3);
    expect(report.sales).toBe(155);
    expect(report.paid).toBe(135);
    expect(report.followUp).toEqual({ count: 1, total: 20 });
    expect(report.awaiting).toEqual({ count: 1, total: 40 });
    expect(report.cancelled).toEqual({ count: 1, total: 15 });
    expect(report.discounts).toBe(5);
    expect(report.deliveryFees).toBe(10);
    expect(report.average).toBe(51.67);
    expect(report.byFulfillment.find((row) => row.key === "delivery")).toEqual({ key: "delivery", count: 1, total: 35 });
    expect(report.byBranch.find((row) => row.name === "الشمال")).toEqual({ name: "الشمال", count: 2, total: 120 });
    expect(report.products[0]).toEqual({ name: "برجر", quantity: 3, total: 125 });
    expect(report.orders).toHaveLength(5);

    const north = buildDailyReport("2026-01-10", orders, "الشمال");
    expect(north.orderCount).toBe(2);
    expect(north.sales).toBe(120);
  });

  it("is empty on a quiet day", () => {
    const report = buildDailyReport("2026-01-10", []);
    expect(report).toMatchObject({ orderCount: 0, sales: 0, average: 0, orders: [] });
  });
});

describe("payment methods, the comparison and the summary", () => {
  it("reads Moyasar and provider payments into methods", async () => {
    const { methodFromMoyasarSource, methodFromPaymentId } = await import("../lib/catalog-payment-method");
    expect(methodFromMoyasarSource({ type: "creditcard", company: "mada" })).toBe("mada");
    expect(methodFromMoyasarSource({ type: "creditcard", company: "visa" })).toBe("card");
    expect(methodFromMoyasarSource({ type: "applepay", company: "visa" })).toBe("applepay");
    expect(methodFromMoyasarSource({ type: "stcpay" })).toBe("stcpay");
    expect(methodFromMoyasarSource(undefined)).toBe("other");
    expect(methodFromPaymentId("tabby-123")).toBe("tabby");
    expect(methodFromPaymentId("tamara-9")).toBe("tamara");
    expect(methodFromPaymentId("inv_1")).toBeNull();
  });

  it("splits the sales by payment method, compares with yesterday and builds the summary lines", async () => {
    const { summaryRows } = await import("../lib/catalog-daily-summary");
    const orders = [
      order({ id: "ORD-1", total: 100, status: "paid" }),
      order({ id: "ORD-2", total: 50, status: "paid" }),
      order({ id: "ORD-3", total: 20, status: "new" }),
      order({ id: "ORD-4", total: 30, status: "paid" })
    ];
    const methods = new Map([["ORD-1", "mada" as const], ["ORD-2", "applepay" as const]]);
    const report = buildDailyReport("2026-01-10", orders, "", methods, { orderCount: 2, sales: 100 });
    expect(report.byPayment).toEqual([
      { key: "mada", count: 1, total: 100 },
      { key: "applepay", count: 1, total: 50 },
      { key: "unknown", count: 1, total: 30 },
      { key: "cash", count: 1, total: 20 }
    ]);
    expect(report.previous).toMatchObject({ sales: 100, change: 100 });
    expect(buildDailyReport("2026-01-10", orders, "", methods).previous.change).toBeNull();
    const rows = summaryRows(report);
    expect(rows[0]).toEqual(["إجمالي المبيعات", "200 ر.س"]);
    expect(rows.find(([label]) => label === "مقارنة بالأمس")?.[1]).toContain("+100%");
    expect(rows.some(([label]) => label === "الدفع: مدى")).toBe(true);
  });
});
