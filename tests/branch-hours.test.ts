import { describe, expect, it } from "vitest";
import { isBranchOpen, openingTimeLabel, parseBranchHours } from "../lib/branch-hours";

// Saudi time is UTC+3: 12:00 UTC is 15:00 there.
const at = (hourUtc: number, minute = 0) => new Date(Date.UTC(2026, 0, 10, hourUtc, minute));

describe("branch opening hours", () => {
  it("reads the common ways a merchant writes them", () => {
    expect(isBranchOpen("9 ص - 11 م", at(12))).toBe(true); // 15:00
    expect(isBranchOpen("9 ص - 11 م", at(21))).toBe(false); // 00:00
    expect(isBranchOpen("09:00-23:00", at(6))).toBe(true); // 09:00 sharp
    expect(isBranchOpen("09:00-23:00", at(5, 59))).toBe(false); // 08:59
    expect(isBranchOpen("٩ ص إلى ١١ م", at(12))).toBe(true);
    expect(isBranchOpen("من 4 م إلى 12 منتصف الليل", at(12))).toBe(false); // 15:00, opens at 16:00
    expect(isBranchOpen("من 4 م إلى 12 منتصف الليل", at(14))).toBe(true); // 17:00
  });

  it("handles a range that crosses midnight", () => {
    expect(isBranchOpen("6 م - 2 ص", at(20))).toBe(true); // 23:00
    expect(isBranchOpen("6 م - 2 ص", at(22))).toBe(true); // 01:00
    expect(isBranchOpen("6 م - 2 ص", at(3))).toBe(false); // 06:00
  });

  it("never hides a branch it cannot read, and treats 24 hours as always open", () => {
    expect(parseBranchHours("").known).toBe(false);
    expect(isBranchOpen("يوميًا حسب الظروف", at(21))).toBe(true);
    expect(isBranchOpen("24 ساعة", at(21))).toBe(true);
    expect(isBranchOpen("٢٤ ساعة", at(21))).toBe(true);
  });

  it("reads 9-11 without ص / م as morning to evening", () => {
    expect(isBranchOpen("9-11", at(12))).toBe(true);
    expect(isBranchOpen("9-11", at(21))).toBe(false);
  });

  it("tells when a branch opens", () => {
    expect(openingTimeLabel("9 ص - 11 م")).toBe("9 ص");
    expect(openingTimeLabel("16:30-23:00")).toBe("4:30 م");
    expect(openingTimeLabel("24 ساعة")).toBe("");
  });
});
