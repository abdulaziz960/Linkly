/** Bulk branch import: an Excel template to fill in, and a reader for the filled .xlsx / .csv file. */

export type BranchImportRow = { name: string; address: string; phone: string; workingHours: string; mapUrl: string };

type Lang = "ar" | "en";

const HEADERS: Record<Lang, string[]> = {
  ar: ["اسم الفرع", "المدينة", "رقم الفرع", "ساعات الدوام", "رابط الخريطة"],
  en: ["Branch name", "City", "Branch phone", "Working hours", "Map link"]
};

const SAMPLE: Record<Lang, string[]> = {
  ar: ["فرع العليا", "الرياض", "0500000000", "9 ص - 11 م", "https://maps.app.goo.gl/xxxxxxxx"],
  en: ["Olaya branch", "Riyadh", "0500000000", "9 AM - 11 PM", "https://maps.app.goo.gl/xxxxxxxx"]
};

const ALIASES: Record<keyof BranchImportRow, string[]> = {
  name: ["اسم الفرع", "الاسم", "branch name", "name"],
  address: ["المدينة", "العنوان", "city", "address"],
  phone: ["رقم الفرع", "الجوال", "رقم الجوال", "الهاتف", "branch phone", "phone"],
  workingHours: ["ساعات الدوام", "الدوام", "working hours", "hours"],
  mapUrl: ["رابط الخريطة", "رابط", "map link", "map url", "map"]
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const rich = value as { text?: unknown; hyperlink?: unknown; richText?: Array<{ text: string }> };
    if (rich.richText) return rich.richText.map((part) => part.text).join("").trim();
    if (typeof rich.text === "string") return rich.text.trim();
    if (typeof rich.hyperlink === "string") return rich.hyperlink.trim();
  }
  return String(value).trim();
}

function mapRows(table: unknown[][]): BranchImportRow[] {
  if (!table.length) return [];
  const header = table[0].map(normalizeHeader);
  const index: Partial<Record<keyof BranchImportRow, number>> = {};
  (Object.keys(ALIASES) as Array<keyof BranchImportRow>).forEach((key) => {
    const found = header.findIndex((name) => ALIASES[key].includes(name));
    if (found >= 0) index[key] = found;
  });
  if (index.name === undefined) return [];
  const pick = (row: unknown[], key: keyof BranchImportRow) => (index[key] === undefined ? "" : cellText(row[index[key] as number]));
  return table
    .slice(1)
    .map((row) => ({ name: pick(row, "name"), address: pick(row, "address"), phone: pick(row, "phone"), workingHours: pick(row, "workingHours"), mapUrl: pick(row, "mapUrl") }))
    .filter((row) => row.name || row.address || row.mapUrl);
}

/** A small RFC-4180 reader: quoted fields, doubled quotes, commas or semicolons, CRLF. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const delimiter = (clean.split("\n", 1)[0].match(/;/g)?.length ?? 0) > (clean.split("\n", 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export async function parseBranchFile(file: File): Promise<BranchImportRow[]> {
  if (/\.csv$/i.test(file.name)) return mapRows(parseCsv(await file.text()));
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets[0];
  if (!sheet) return [];
  const table: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1);
    table.push(values);
  });
  return mapRows(table);
}

export async function downloadBranchTemplate(lang: Lang) {
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(lang === "ar" ? "الفروع" : "Branches", { views: [{ rightToLeft: lang === "ar" }] });
  sheet.columns = HEADERS[lang].map((header, index) => ({ header, key: `c${index}`, width: [28, 36, 18, 22, 44][index] }));
  sheet.addRow(SAMPLE[lang]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1EFED" } };
  const buffer = await book.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = lang === "ar" ? "نموذج-الفروع.xlsx" : "branches-template.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}
