import { describe, expect, it } from "vitest";
import { buildCsv, sanitizeCsvCell } from "../lib/csv-export";

// Pre-launch audit finding: every CSV export in the dashboard/admin panel
// independently reimplemented cell quoting with no defense against
// CSV/Formula Injection - a cell value starting with =, +, -, or @ is
// interpreted as a formula by Excel/Google Sheets the instant the file is
// opened, even inside a quoted field. Several exports include
// user-influenced text (employee names, campaign recipient names, tenant
// company names), so this is a real injection surface, not theoretical.
describe("sanitizeCsvCell", () => {
  it("prefixes a leading apostrophe onto every known formula-trigger character", () => {
    expect(sanitizeCsvCell("=HYPERLINK(\"http://evil.com\",\"click\")")).toBe(`"'=HYPERLINK(""http://evil.com"",""click"")"`);
    expect(sanitizeCsvCell("+1+1")).toBe(`"'+1+1"`);
    expect(sanitizeCsvCell("-1")).toBe(`"'-1"`);
    expect(sanitizeCsvCell("@SUM(A1:A10)")).toBe(`"'@SUM(A1:A10)"`);
    expect(sanitizeCsvCell("\tsneaky")).toBe(`"'\tsneaky"`);
  });

  it("leaves ordinary text and numbers untouched apart from normal quote escaping", () => {
    expect(sanitizeCsvCell("Regular Name")).toBe(`"Regular Name"`);
    expect(sanitizeCsvCell(42)).toBe(`"42"`);
    expect(sanitizeCsvCell(`Say "hi"`)).toBe(`"Say ""hi"""`);
  });

  it("builds a full CSV with header row and sanitized data rows", () => {
    const csv = buildCsv(["Name", "Amount"], [["=cmd", 100], ["Safe", 200]]);
    expect(csv).toBe(`"Name","Amount"\r\n"'=cmd","100"\r\n"Safe","200"`);
  });
});
