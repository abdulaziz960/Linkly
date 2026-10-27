import { describe, expect, it } from "vitest";
import { messageDayLabel, riyadhDayKey } from "../lib/time";

describe("message day chip", () => {
  // 10:00 in Riyadh on 26 Oct 2026
  const now = Date.UTC(2026, 9, 26, 7, 0);

  it("calls today and yesterday by name, older days by date", () => {
    expect(messageDayLabel(new Date(Date.UTC(2026, 9, 26, 5, 0)), "ar", now)).toMatch(/^اليوم – 26 /);
    expect(messageDayLabel(new Date(Date.UTC(2026, 9, 25, 12, 0)), "ar", now)).toMatch(/^أمس – 25 /);
    expect(messageDayLabel(new Date(Date.UTC(2026, 9, 20, 12, 0)), "ar", now)).toMatch(/^20 /);
    expect(messageDayLabel(new Date(Date.UTC(2026, 9, 26, 5, 0)), "en", now)).toBe("Today – 26 October 2026");
  });

  it("splits days at Riyadh midnight, not UTC midnight", () => {
    // 21:30 UTC on the 25th is 00:30 on the 26th in Riyadh
    expect(riyadhDayKey(new Date(Date.UTC(2026, 9, 25, 21, 30)))).toBe("2026-10-26");
    expect(riyadhDayKey(new Date(Date.UTC(2026, 9, 25, 20, 30)))).toBe("2026-10-25");
  });
});
