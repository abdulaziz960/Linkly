import type { UnitStatus } from "./crm-units";

/**
 * Turns a table pasted from Excel, Word, Google Sheets or a web page into units, with no AI involved.
 * Pure and safe for the browser: the dashboard shows the result for review before anything is saved.
 */

export type PastedUnit = { name: string; kind: string; model: string; area: string; priceText: string; status: UnitStatus };
type Field = "name" | "model" | "kind" | "area" | "price" | "status";

const STATUS_WORDS: Array<[RegExp, UnitStatus]> = [[/sold|مباع|مباعة|مباعه|تم البيع/i, "sold"], [/reserv|محجوز|محجوزة|حجز/i, "reserved"], [/avail|متاح|متاحة|متوفر/i, "available"]];

export function westernDigits(value: string) {
  return value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

export function unitStatusFromText(value: unknown): UnitStatus {
  const text = String(value ?? "");
  return STATUS_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? "available";
}

export function formatUnitPrice(raw: unknown): string {
  const text = westernDigits(String(raw ?? "")).trim();
  if (!text || /^[-–—_.]+$/.test(text)) return "";
  const compact = text.replace(/[,\s٬.](?=\d{3}(\D|$))/g, "").replace(/[^\d.]/g, "");
  if (/^\d+(\.\d+)?$/.test(compact) && Number(compact) > 0) return `${Math.round(Number(compact)).toLocaleString("en-US")} ر.س`;
  return text.slice(0, 80);
}

export function formatUnitArea(raw: unknown): string {
  const text = westernDigits(String(raw ?? "")).replace(/م\s*[²2]?|m2|m²/gi, "").trim();
  return /^\d+([.,]\d+)?$/.test(text) ? `${text.replace(",", ".")} م²` : text.slice(0, 60);
}

const HEADERS: Array<[Field, RegExp]> = [
  ["name", /^(الوحدة|رقم الوحدة|رمز الوحدة|كود الوحدة|الكود|الرمز|الرقم|unit|unit no\.?|code|name)$/i],
  ["model", /^(النموذج|نموذج|model)$/i],
  ["kind", /^(وصف الوحدة|الوصف|وصف|نوع الوحدة|النوع|نوع|type|description)$/i],
  ["area", /^(المساحة|مساحة الوحدة|مساحة|area|size)$/i],
  ["price", /^(السعر|سعر الوحدة|سعر|price)$/i],
  ["status", /^(حالة الوحدة|الحالة|حالة|status)$/i]
];
// The order the unit form uses, for a paste with no header row.
const DEFAULT_ORDER: Field[] = ["name", "area", "price", "kind", "status"];

function splitLine(line: string, delimiter: string | RegExp) {
  return line.split(delimiter).map((cell) => cell.trim());
}

/** Rows of cells from the pasted text; the delimiter is whatever the source used (tab, |, ; , or wide spaces). */
function rowsOf(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean)
    .filter((line) => !/^[|\s:\-–—+=]+$/.test(line));
  if (!lines.length) return [];
  const delimiter: string | RegExp = lines.some((line) => line.includes("\t")) ? "\t"
    : lines.some((line) => line.includes("|")) ? "|"
    : lines.some((line) => /[;؛]/.test(line)) ? /[;؛]/
    : lines.some((line) => line.includes(",") && !/\d,\d{3}\b/.test(line)) ? ","
    : /\s{2,}/;
  return lines.map((line) => {
    const cells = splitLine(delimiter === "|" ? line.replace(/^\||\|$/g, "") : line, delimiter);
    return cells;
  });
}

export function parsePastedUnits(text: string): { units: PastedUnit[]; skipped: number } {
  const rows = rowsOf(text);
  if (!rows.length) return { units: [], skipped: 0 };
  const headerMatch = rows[0].map((cell) => HEADERS.find(([, pattern]) => pattern.test(cell.replace(/[:：*]/g, "").trim()))?.[0] ?? null);
  const hasHeader = headerMatch.filter(Boolean).length >= 2;
  const order: Array<Field | null> = hasHeader ? headerMatch : DEFAULT_ORDER;
  const body = hasHeader ? rows.slice(1) : rows;
  const seen = new Set<string>();
  const units: PastedUnit[] = [];
  let skipped = 0;
  for (const cells of body) {
    const get = (field: Field) => {
      const index = order.indexOf(field);
      return index >= 0 ? (cells[index] ?? "").trim() : "";
    };
    const name = westernDigits(get("name")).replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 2 || seen.has(name.toLowerCase())) { skipped += 1; continue; }
    seen.add(name.toLowerCase());
    units.push({
      name,
      kind: get("kind").replace(/[()（）]/g, "").replace(/\s+/g, " ").trim().slice(0, 60),
      model: get("model").replace(/^(نموذج|model)\s*/i, "").trim().slice(0, 40),
      area: formatUnitArea(get("area")),
      priceText: formatUnitPrice(get("price")),
      status: unitStatusFromText(get("status"))
    });
  }
  return { units, skipped };
}
