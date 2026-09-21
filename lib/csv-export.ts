// Shared CSV cell escaping for every client-side export in the dashboard
// and admin panel (Reports, Employees, Campaign Engagement, Admin Logs,
// Admin Payments) - previously each view reimplemented its own quoting
// with no defense against CSV/Formula Injection: a cell value starting
// with =, +, -, or @ is interpreted as a formula by Excel/Google Sheets
// the moment the file is opened, even inside a quoted CSV field. Several
// of these exports include user-influenced text (an employee's own name,
// a campaign recipient's name from an uploaded list), so an attacker who
// controls that text could plant a formula an admin's spreadsheet app
// would execute on open (e.g. =HYPERLINK(...) exfiltrating data).
// See pre-launch audit finding on CSV export.
const FORMULA_TRIGGER_CHARS = ["=", "+", "-", "@", "\t", "\r"];

export function sanitizeCsvCell(value: string | number): string {
  let text = String(value);
  if (FORMULA_TRIGGER_CHARS.some((char) => text.startsWith(char))) {
    // A leading apostrophe is the standard mitigation: Excel/Sheets render
    // the cell as literal text instead of evaluating it as a formula.
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsv(headers: Array<string | number>, rows: Array<Array<string | number>>): string {
  return [headers, ...rows].map((row) => row.map(sanitizeCsvCell).join(",")).join("\r\n");
}
