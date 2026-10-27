import { describe, expect, it } from "vitest";
import { isTaxCustomer, TAX_INVOICES_FROM } from "../lib/tax-customer";

describe("who pays VAT", () => {
  it("applies to a customer who has not paid yet", () => {
    expect(isTaxCustomer([])).toBe(true);
    expect(isTaxCustomer(["", ""])).toBe(true);
  });

  it("applies to a customer whose first payment is on or after the start date", () => {
    expect(isTaxCustomer([`${TAX_INVOICES_FROM}T08:00:00.000Z`])).toBe(true);
    expect(isTaxCustomer(["2026-11-03T10:00:00.000Z", "2026-12-01T10:00:00.000Z"])).toBe(true);
  });

  it("does not apply to a customer who paid before the start date, whatever they pay later", () => {
    expect(isTaxCustomer(["2026-10-02T10:00:00.000Z", "2026-11-02T10:00:00.000Z"])).toBe(false);
    expect(isTaxCustomer(["2026-11-02T10:00:00.000Z", "2026-10-26T23:59:59.000Z"])).toBe(false);
  });
});
