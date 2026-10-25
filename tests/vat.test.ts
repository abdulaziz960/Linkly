import { describe, expect, it } from "vitest";
import { grossHalalas, grossHalalasFromNetHalalas, paymentTaxBreakdown, SELLER, vatOn } from "../lib/vat";

describe("VAT on Linkly's own sales", () => {
  it("adds 15% on top of a price without tax, rounded to the halala", () => {
    expect(vatOn(349)).toBe(52.35);
    expect(grossHalalas(349)).toBe(40135);
    expect(grossHalalas(199)).toBe(22885);
    expect(grossHalalas(3141)).toBe(361215);
    expect(grossHalalas(0)).toBe(0);
    expect(vatOn(0.01 * 3)).toBe(0); // 0.0045 rounds to the halala
    expect(grossHalalasFromNetHalalas(3500)).toBe(4025); // 35.00 -> 40.25
    expect(grossHalalas(10.1)).toBe(1162); // 10.10 + 1.52 (1.515 rounds up)
  });

  it("reads a new payment as tax added on top of the price", () => {
    expect(paymentTaxBreakdown({ amount: 349, amountHalalas: 40135, gateway: "moyasar" })).toEqual({ mode: "added", net: 349, vat: 52.35, total: 401.35 });
  });

  it("reads a payment made before tax was added as already including it - the customer paid the same amount", () => {
    expect(paymentTaxBreakdown({ amount: 349, amountHalalas: 34900, gateway: "moyasar" })).toEqual({ mode: "inclusive", net: 303.48, vat: 45.52, total: 349 });
    expect(paymentTaxBreakdown({ amount: 3141, amountHalalas: 0, gateway: "moyasar" })).toMatchObject({ mode: "inclusive", total: 3141, net: 2731.3, vat: 409.7 });
    // net + vat always makes the total back
    const old = paymentTaxBreakdown({ amount: 199, amountHalalas: 19900, gateway: "moyasar" });
    expect(Math.round((old.net + old.vat) * 100)).toBe(19900);
  });

  it("shows no tax lines for payments Linkly did not collect", () => {
    expect(paymentTaxBreakdown({ amount: 899, amountHalalas: 89900, gateway: "salla" }).mode).toBe("none");
    expect(paymentTaxBreakdown({ amount: 100, amountHalalas: 10000, gateway: "manual" })).toMatchObject({ mode: "none", vat: 0, total: 100 });
  });

  it("carries the registered seller details from the certificate", () => {
    expect(SELLER.vatNumber).toBe("311643962400003");
    expect(SELLER.crNumber).toBe("1010870212");
    expect(SELLER.name).toContain("الجمهور المخصص");
  });
});
