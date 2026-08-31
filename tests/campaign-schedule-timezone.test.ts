import { describe, expect, it } from "vitest";
import { parseRiyadhDateTime } from "../lib/campaign-engine";

describe("parseRiyadhDateTime", () => {
  it("interprets a datetime-local value as Asia/Riyadh (UTC+3), not the server's local time", () => {
    // A user picks 10:00 in Riyadh - that's 07:00 UTC, not 10:00 UTC.
    const date = parseRiyadhDateTime("2026-09-01T10:00");
    expect(date?.toISOString()).toBe("2026-09-01T07:00:00.000Z");
  });

  it("handles a value that already includes seconds", () => {
    const date = parseRiyadhDateTime("2026-09-01T10:00:30");
    expect(date?.toISOString()).toBe("2026-09-01T07:00:30.000Z");
  });

  it("returns null for an empty or invalid value", () => {
    expect(parseRiyadhDateTime("")).toBeNull();
    expect(parseRiyadhDateTime("not-a-date")).toBeNull();
  });
});
