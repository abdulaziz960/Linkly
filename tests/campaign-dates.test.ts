import { describe, expect, it } from "vitest";
import { formatFullDateTime, formatRelativeTime, parseStoredDate } from "../lib/time";

describe("stored campaign dates", () => {
  it("reads ISO and the old en-US server format (UTC)", () => {
    expect(parseStoredDate("2026-10-25T12:22:30.000Z")?.toISOString()).toBe("2026-10-25T12:22:30.000Z");
    expect(parseStoredDate("10/25/2026, 3:22:30 PM")?.toISOString()).toBe("2026-10-25T15:22:30.000Z");
    expect(parseStoredDate("10/25/2026, 12:05:00 AM")?.toISOString()).toBe("2026-10-25T00:05:00.000Z");
    expect(parseStoredDate("12/1/2026, 12:00:00 PM")?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(parseStoredDate("")).toBeNull();
    expect(parseStoredDate("not a date")).toBeNull();
  });

  it("formats a full date in Riyadh time on a 24-hour clock with Western digits", () => {
    const text = formatFullDateTime(new Date("2026-10-25T12:22:30.000Z"));
    expect(text).toContain("2026");
    expect(text).toContain("15:22");
    expect(text).not.toMatch(/[٠-٩]/);
    expect(text).not.toMatch(/ص|م\b/);
  });

  it("describes how long ago in words", () => {
    const now = new Date("2026-10-25T12:00:00Z").getTime();
    expect(formatRelativeTime(new Date("2026-10-25T10:00:00Z"), "en", now)).toBe("2 hours ago");
    expect(formatRelativeTime(new Date("2026-10-28T12:00:00Z"), "en", now)).toBe("in 3 days");
    expect(formatRelativeTime(new Date("2026-10-25T11:59:40Z"), "en", now)).toMatch(/minute|now/);
    expect(formatRelativeTime(new Date("2026-10-25T10:00:00Z"), "ar", now)).toMatch(/ساعت/);
  });
});
