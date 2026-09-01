import { describe, expect, it } from "vitest";
import { isValidEmail, isValidSaudiPhone } from "../lib/validation";

describe("isValidEmail", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("name@company.sa")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.com")).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a@b.")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
  });
});

describe("isValidSaudiPhone", () => {
  it("accepts common valid Saudi mobile formats", () => {
    expect(isValidSaudiPhone("0512345678")).toBe(true);
    expect(isValidSaudiPhone("512345678")).toBe(true);
    expect(isValidSaudiPhone("966512345678")).toBe(true);
    expect(isValidSaudiPhone("+966512345678")).toBe(true);
    expect(isValidSaudiPhone("00966512345678")).toBe(true);
    expect(isValidSaudiPhone("05 1234 5678")).toBe(true);
    expect(isValidSaudiPhone("05-1234-5678")).toBe(true);
  });

  it("rejects the exact garbage report that prompted this fix (two Arabic-Indic zeros)", () => {
    expect(isValidSaudiPhone("٠٠")).toBe(false);
  });

  it("rejects non-Saudi and malformed numbers", () => {
    expect(isValidSaudiPhone("")).toBe(false);
    expect(isValidSaudiPhone("123")).toBe(false);
    expect(isValidSaudiPhone("0612345678")).toBe(false); // wrong prefix (06, not 05)
    expect(isValidSaudiPhone("051234567")).toBe(false); // too short
    expect(isValidSaudiPhone("05123456789")).toBe(false); // too long
    expect(isValidSaudiPhone("+14155551234")).toBe(false); // US number
  });

  it("accepts a valid number written in Arabic-Indic digits", () => {
    expect(isValidSaudiPhone("٠٥١٢٣٤٥٦٧٨")).toBe(true);
  });
});
