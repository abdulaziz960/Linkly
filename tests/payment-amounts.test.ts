import { describe, expect, it } from "vitest";
import { paymentAmounts } from "../lib/payment-amounts";

describe("paymentAmounts", () => {
  it("gateway payment: net in amount, gross in halalas", () => {
    expect(paymentAmounts({ amount: 100, amountHalalas: 11500, gateway: "moyasar" })).toEqual({ total: 115, vat: 15, net: 100 });
  });
  it("legacy gateway payment without tax added is treated as tax-inclusive", () => {
    expect(paymentAmounts({ amount: 115, amountHalalas: 11500, gateway: "moyasar" })).toEqual({ total: 115, vat: 15, net: 100 });
  });
  it("manual confirmation uses the recorded net", () => {
    expect(paymentAmounts({ amount: 115, amountHalalas: 11500, gateway: "manual", metadataJson: JSON.stringify({ kind: "manual", netSar: 100 }) })).toEqual({ total: 115, vat: 15, net: 100 });
  });
  it("quote payment without net splits 15% inclusive", () => {
    expect(paymentAmounts({ amount: 230, amountHalalas: 23000, gateway: "manual", metadataJson: JSON.stringify({ kind: "quote" }) })).toEqual({ total: 230, vat: 30, net: 200 });
  });
  it("hand-credited manual payment has no tax", () => {
    expect(paymentAmounts({ amount: 50, amountHalalas: 0, gateway: "manual", metadataJson: "" })).toEqual({ total: 50, vat: 0, net: 50 });
  });
});
