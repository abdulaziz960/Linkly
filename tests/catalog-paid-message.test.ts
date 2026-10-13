import { describe, expect, it } from "vitest";
import { buildPaidOrderMessage, shortOrderNumber } from "../lib/catalog-payments";

const order = {
  id: "ord-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  customerName: "سارة العتيبي",
  customerPhone: "966500001111",
  productName: "ساعة ذكية",
  quantity: 1,
  total: 349,
  currency: "SAR"
};

describe("paid order confirmation", () => {
  it("makes a short readable order number", () => {
    expect(shortOrderNumber(order.id)).toBe("ORD-1A2B3C4D");
  });

  it("names the customer, the order, the product, the amount and the date", () => {
    const text = buildPaidOrderMessage(order, "2026-10-14T09:00:00.000Z");
    expect(text).toContain("شكرًا لك سارة العتيبي، تم استلام دفعك ✅");
    expect(text).toContain("رقم الطلب: ORD-1A2B3C4D");
    expect(text).toContain("المنتج: ساعة ذكية");
    expect(text).toContain("المبلغ المدفوع: 349 ر.س");
    expect(text).toMatch(/التاريخ: .*2026/);
    expect(text).not.toContain("الكمية");
  });

  it("shows the quantity only when it is more than one, and decimals for fractional totals", () => {
    const text = buildPaidOrderMessage({ ...order, quantity: 3, total: 1047.5 }, "2026-10-14T09:00:00.000Z");
    expect(text).toContain("الكمية: 3");
    expect(text).toContain("المبلغ المدفوع: 1047.50 ر.س");
  });

  it("does not greet by a placeholder name (a phone number or 'عميل 1234')", () => {
    expect(buildPaidOrderMessage({ ...order, customerName: "966500001111" }, "2026-10-14T09:00:00.000Z")).toMatch(/^تم استلام دفعك ✅/);
    expect(buildPaidOrderMessage({ ...order, customerName: "عميل 1234" }, "2026-10-14T09:00:00.000Z")).toMatch(/^تم استلام دفعك ✅/);
  });

  it("falls back to the conversation's customer name when the order has none", () => {
    expect(buildPaidOrderMessage({ ...order, customerName: "" }, "2026-10-14T09:00:00.000Z", "خالد")).toContain("شكرًا لك خالد");
  });
});
