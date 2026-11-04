import { describe, expect, it } from "vitest";
import { annualInvoice } from "../app/linkly-admin007/clients/clients-data";

describe("annual invoice of a client", () => {
  const client = (amount: number, employeeCount = 3, employeeLimit = 3) => ({ amount, employeeCount, employeeLimit });

  it("does not multiply an amount that already is the annual charge", () => {
    // A checkout payment stored 599 x 12 x 0.75 = 5,391 for a 599/month plan.
    expect(annualInvoice(client(5391), 599)).toEqual({ total: 5391, monthlyEquivalent: 449 });
    expect(annualInvoice(client(8091), 899)).toEqual({ total: 8091, monthlyEquivalent: 674 });
  });

  it("annualises a monthly price left by a manual cycle change", () => {
    expect(annualInvoice(client(199), 199)).toEqual({ total: 1791, monthlyEquivalent: 149 });
  });

  it("adds extra users at the annual rate on top", () => {
    // 2 extra users = 130 / month -> 1,170 / year on the same yearly discount.
    expect(annualInvoice(client(5391, 5, 3), 599).total).toBe(5391 + 1170);
    expect(annualInvoice(client(199, 5, 3), 199).total).toBe(1791 + 1170);
  });

  it("falls back to treating the amount as monthly when the plan is unknown", () => {
    expect(annualInvoice(client(199)).total).toBe(1791);
  });
});
