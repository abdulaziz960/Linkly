import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { hashEmail, hashName, hashPhoneDigits, splitName } from "../lib/identity-hash";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("identifier hashing for the ad platforms", () => {
  it("hashes an email lower-cased and trimmed, and drops anything that is not an email", () => {
    expect(hashEmail("  Majed@Example.COM ")).toBe(sha("majed@example.com"));
    expect(hashEmail("not-an-email")).toBe("");
    expect(hashEmail("")).toBe("");
    expect(hashEmail(null)).toBe("");
  });

  it("hashes names without punctuation, digits or spaces, and skips tiny ones", () => {
    expect(hashName(" Mohammed ")).toBe(sha("mohammed"));
    expect(hashName("O'Brien")).toBe(sha("obrien"));
    expect(hashName("محمد")).toBe(sha("محمد"));
    expect(hashName("م")).toBe("");
    expect(hashName("")).toBe("");
  });

  it("hashes the phone as digits with the country code", () => {
    expect(hashPhoneDigits("+966 50 000 0111")).toBe(sha("966500000111"));
    expect(hashPhoneDigits("12")).toBe("");
  });

  it("splits a full name into first and last", () => {
    expect(splitName("محمد عبدالله العتيبي")).toEqual({ first: "محمد", last: "العتيبي" });
    expect(splitName("هند")).toEqual({ first: "هند", last: "" });
    expect(splitName("  ")).toEqual({ first: "", last: "" });
  });
});
