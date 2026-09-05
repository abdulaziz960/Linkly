import { describe, expect, it } from "vitest";
import { nextRecurrenceRun, isRecurrenceExpired } from "../lib/campaign-engine";

describe("nextRecurrenceRun", () => {
  it("adds a single day for a daily cadence", () => {
    const current = new Date("2026-09-10T09:00:00.000Z");
    const next = nextRecurrenceRun(current, 1);
    expect(next.toISOString()).toBe("2026-09-11T09:00:00.000Z");
  });

  it("adds seven days for a weekly cadence", () => {
    const current = new Date("2026-09-10T09:00:00.000Z");
    const next = nextRecurrenceRun(current, 7);
    expect(next.toISOString()).toBe("2026-09-17T09:00:00.000Z");
  });

  it("correctly crosses a month boundary for a 30-day cadence", () => {
    const current = new Date("2026-01-20T12:00:00.000Z");
    const next = nextRecurrenceRun(current, 30);
    expect(next.toISOString()).toBe("2026-02-19T12:00:00.000Z");
  });
});

describe("isRecurrenceExpired", () => {
  it("never expires when there is no end date", () => {
    expect(isRecurrenceExpired("2026-09-11T09:00:00.000Z", "")).toBe(false);
  });

  it("is not expired when the next run is still before the end date", () => {
    expect(isRecurrenceExpired("2026-09-11T09:00:00.000Z", "2026-12-01T00:00:00.000Z")).toBe(false);
  });

  it("is expired when the next run would fall after the end date", () => {
    expect(isRecurrenceExpired("2026-09-11T09:00:00.000Z", "2026-09-01T00:00:00.000Z")).toBe(true);
  });
});
