// Pure and I/O-free so the campaign form can validate pasted numbers as they are typed, and the server can
// use the exact same rules for uploaded files.

export type PhoneRejectReason = "empty" | "not_a_number" | "too_short" | "too_long" | "saudi_incomplete" | "saudi_extra" | "saudi_not_mobile";

export type PhoneCheck = { ok: true; phone: string } | { ok: false; reason: PhoneRejectReason };

export const PHONE_REASON_LABELS: Record<PhoneRejectReason, [string, string]> = {
  empty: ["رقم فارغ", "Empty number"],
  not_a_number: ["ليس رقمًا", "Not a number"],
  too_short: ["الرقم ناقص (أقل من 8 أرقام)", "Number too short (under 8 digits)"],
  too_long: ["الرقم زائد (أكثر من 15 رقمًا)", "Number too long (over 15 digits)"],
  saudi_incomplete: ["رقم سعودي ناقص - يجب أن يكون 9665XXXXXXXX", "Incomplete Saudi number - must be 9665XXXXXXXX"],
  saudi_extra: ["رقم سعودي فيه أرقام زائدة - يجب أن يكون 9665XXXXXXXX", "Saudi number has extra digits - must be 9665XXXXXXXX"],
  saudi_not_mobile: ["الرقم السعودي ليس جوالًا (لا يستقبل واتساب)", "Saudi number is not a mobile (cannot receive WhatsApp)"]
};

/** Saudi local formats (05XXXXXXXX / 5XXXXXXXX) become 9665XXXXXXXX; everything else is just its digits. */
export function normalizePhoneDigits(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  return digits;
}

export function checkPhoneNumber(raw: string): PhoneCheck {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (!/\d/.test(text)) return { ok: false, reason: "not_a_number" };
  const phone = normalizePhoneDigits(text);
  if (phone.length < 8) return { ok: false, reason: "too_short" };
  if (phone.length > 15) return { ok: false, reason: "too_long" };
  if (phone.startsWith("966")) {
    if (phone.length < 12) return { ok: false, reason: "saudi_incomplete" };
    if (phone.length > 12) return { ok: false, reason: "saudi_extra" };
    if (!phone.startsWith("9665")) return { ok: false, reason: "saudi_not_mobile" };
  }
  return { ok: true, phone };
}

export type AnalyzedRecipient = { phone: string; name: string };
export type RejectedNumber = { line: number; raw: string; name: string; reason: PhoneRejectReason };
export type RecipientAnalysis = { valid: AnalyzedRecipient[]; rejected: RejectedNumber[]; duplicates: number; totalRows: number };

/** Rows are [phone, name?]. A first row whose phone cell has no digit at all is taken as a header and skipped. */
export function analyzeRows(rows: Array<{ line: number; phone: string; name: string }>, maxRecipients = Infinity, hasHeader = true): RecipientAnalysis {
  const valid: AnalyzedRecipient[] = [];
  const rejected: RejectedNumber[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let totalRows = 0;
  rows.forEach((row, index) => {
    if (!row.phone.trim() && !row.name.trim()) return;
    if (hasHeader && index === 0 && !/\d/.test(row.phone)) return;
    totalRows += 1;
    const check = checkPhoneNumber(row.phone);
    if (!check.ok) { rejected.push({ line: row.line, raw: row.phone.trim(), name: row.name.trim(), reason: check.reason }); return; }
    if (seen.has(check.phone)) { duplicates += 1; return; }
    if (valid.length >= maxRecipients) return;
    seen.add(check.phone);
    valid.push({ phone: check.phone, name: row.name.trim() });
  });
  return { valid, rejected, duplicates, totalRows };
}

/**
 * Pasted numbers: one per line, or several separated by spaces/commas/semicolons. A line with a comma, semicolon
 * or tab is "number, name" (the first cell is the number).
 */
export function analyzePastedNumbers(text: string, maxRecipients = Infinity): RecipientAnalysis {
  const rows: Array<{ line: number; phone: string; name: string }> = [];
  text.split(/\r?\n/).forEach((lineText, i) => {
    const line = lineText.trim();
    if (!line) return;
    if (/[,;\t،]/.test(line)) {
      const cells = line.split(/[,;\t،]/).map((cell) => cell.trim());
      const onlyNumbers = cells.every((cell) => !cell || /^[+\d\s()-]+$/.test(cell));
      if (onlyNumbers) cells.filter(Boolean).forEach((cell) => rows.push({ line: i + 1, phone: cell, name: "" }));
      else rows.push({ line: i + 1, phone: cells[0] || "", name: cells[1] || "" });
      return;
    }
    const parts = line.split(/\s+/);
    if (parts.length > 1 && parts.every((part) => /^[+\d()-]+$/.test(part)) && parts.every((part) => part.replace(/\D/g, "").length >= 8)) {
      parts.forEach((part) => rows.push({ line: i + 1, phone: part, name: "" }));
      return;
    }
    rows.push({ line: i + 1, phone: line, name: "" });
  });
  // pasted text has no header row: a line that is not a number is reported, not silently dropped
  return analyzeRows(rows, maxRecipients, false);
}
