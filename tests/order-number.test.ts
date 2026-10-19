import { describe, expect, it } from "vitest";
import { orderMatchesQuery, shortOrderNumber } from "../lib/order-number";

const order = { id: "ord-cf449cc2-1111-2222-3333-444455556666", customerName: "سارة العتيبي", customerPhone: "966500001111", productName: "ساعة ذكية، قهوة", items: [{ productName: "ساعة ذكية" }, { productName: "قهوة" }] };

describe("order number", () => {
  it("is the short ORD- code the customer sees", () => {
    expect(shortOrderNumber(order.id)).toBe("ORD-CF449CC2");
  });
});

describe("the orders search box", () => {
  it("finds an order by its number, however it is typed", () => {
    for (const query of ["ORD-CF449CC2", "ord-cf449cc2", "ORDCF449CC2", "CF449CC2", "cf44", "#ORD-CF449CC2", " ORD CF449CC2 "]) {
      expect(orderMatchesQuery(order, query), query).toBe(true);
    }
    expect(orderMatchesQuery(order, "ORD-AAAA0000")).toBe(false);
  });

  it("also finds it by customer, phone or product, and an empty box shows everything", () => {
    expect(orderMatchesQuery(order, "سارة")).toBe(true);
    expect(orderMatchesQuery(order, "500001111")).toBe(true);
    expect(orderMatchesQuery(order, "قهوة")).toBe(true);
    expect(orderMatchesQuery(order, "")).toBe(true);
    expect(orderMatchesQuery(order, "غير موجود")).toBe(false);
  });
});
