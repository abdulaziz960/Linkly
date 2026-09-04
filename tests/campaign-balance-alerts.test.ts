import { describe, expect, it } from "vitest";
import { thresholdsToAlert } from "../lib/campaign-balance-alerts";

describe("thresholdsToAlert", () => {
  it("alerts nothing while comfortably above every threshold", () => {
    expect(thresholdsToAlert(60)).toEqual([]);
  });

  it("crosses only the 50% threshold", () => {
    expect(thresholdsToAlert(45)).toEqual([50]);
  });

  it("crosses both 50% and 20% at once", () => {
    expect(thresholdsToAlert(18)).toEqual([50, 20]);
  });

  it("crosses all three thresholds when nearly empty", () => {
    expect(thresholdsToAlert(3)).toEqual([50, 20, 5]);
  });

  it("treats exactly-on-threshold as crossed", () => {
    expect(thresholdsToAlert(50)).toEqual([50]);
    expect(thresholdsToAlert(20)).toEqual([50, 20]);
    expect(thresholdsToAlert(5)).toEqual([50, 20, 5]);
  });

  it("treats zero or negative remaining as fully crossed", () => {
    expect(thresholdsToAlert(0)).toEqual([50, 20, 5]);
  });
});
