import { createHash, randomUUID } from "crypto";
import ExcelJS from "exceljs";
import { ensureSchema } from "./database";
import { platformFromLeadSource } from "./lead-form";
import { recordFormAdSource } from "./ad-source";
import { leadWhatsappNumber } from "./phone-format";
import { prisma } from "./prisma";
import { isValidSaudiPhone } from "./validation";
import { whatsappThreadIds } from "./whatsapp-inbox";

/**
 * Imports leads from a file (a CRM export such as Zoho's): each one becomes a customer and a lead in the stage the
 * file says, with its project and source - and nothing else. No message is sent, no welcome, no assistant, no
 * ad-platform event; the conversation behind the lead is closed and read, so the inbox stays quiet.
 */

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ImportRow = { line: number; name: string; phone: string; email: string; status: string; project: string; source: string; createdAt: string };
export type ImportAnalysis = {
  total: number;
  valid: ImportRow[];
  invalid: Array<{ line: number; name: string; reason: string }>;
  /** Rows whose number already appeared higher up in the file (the first one wins). */
  duplicates: number;
  statuses: Array<{ value: string; count: number }>;
  columns: { name: boolean; phone: boolean; status: boolean; project: boolean; source: boolean; email: boolean };
};

const HEADERS = {
  name: ["العميل المحتمل name", "الاسم", "اسم العميل", "اسم", "name", "full name", "full_name", "customer name"],
  first: ["الاسم الأول", "first name", "first_name"],
  last: ["اسم العائلة", "last name", "last_name"],
  phone: ["الهاتف المحمول", "جوال", "الجوال", "رقم الجوال", "mobile", "phone", "phone number", "phone_number", "هاتف", "الهاتف", "رقم الهاتف"],
  email: ["البريد الإلكتروني", "البريد الالكتروني", "email", "e-mail", "البريد"],
  status: ["حالة العميل المحتمل", "الحالة", "المرحلة", "status", "stage", "lead status"],
  project: ["اسم المشروع", "المشروع", "project", "project name"],
  source: ["مصدر العميل المحتمل", "المصدر", "source", "lead source", "lead_source"],
  created: ["وقت الإنشاء", "تاريخ الإنشاء", "created time", "created at", "created_at"]
} as const;

const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
const norm = (value: string) => clean(value).toLowerCase().replace(/\s+/g, " ");

/** RFC 4180-style CSV: quoted cells may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value).trim();
}

export async function readTable(buffer: Buffer, filename: string): Promise<string[][]> {
  if (/\.csv$/i.test(filename) || /\.txt$/i.test(filename)) return parseCsv(buffer.toString("utf-8"));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length > MAX_IMPORT_ROWS + 1) return;
    const cells: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) cells.push(cellText(row.getCell(column).value));
    rows.push(cells);
  });
  return rows;
}

function columnIndexes(header: string[], names: readonly string[]): number[] {
  const wanted = names.map(norm);
  const found: number[] = [];
  for (const name of wanted) header.forEach((cell, index) => { if (norm(cell) === name && !found.includes(index)) found.push(index); });
  return found;
}

/** Turns the table into leads, sorting out the rows that cannot be imported (and why). */
export function analyzeTable(table: string[][]): ImportAnalysis {
  const empty: ImportAnalysis = { total: 0, valid: [], invalid: [], duplicates: 0, statuses: [], columns: { name: false, phone: false, status: false, project: false, source: false, email: false } };
  if (table.length < 2) return empty;
  const header = table[0];
  const at = (key: keyof typeof HEADERS) => columnIndexes(header, HEADERS[key]);
  const idx = { name: at("name"), first: at("first"), last: at("last"), phone: at("phone"), email: at("email"), status: at("status"), project: at("project"), source: at("source"), created: at("created") };
  const pick = (cells: string[], indexes: number[]) => {
    for (const index of indexes) { const value = clean(cells[index] ?? ""); if (value) return value; }
    return "";
  };

  const result: ImportAnalysis = { ...empty, columns: { name: Boolean(idx.name.length || idx.first.length), phone: Boolean(idx.phone.length), status: Boolean(idx.status.length), project: Boolean(idx.project.length), source: Boolean(idx.source.length), email: Boolean(idx.email.length) } };
  const seen = new Set<string>();
  const statusCounts = new Map<string, number>();

  for (let r = 1; r < table.length && result.total < MAX_IMPORT_ROWS; r++) {
    const cells = table[r];
    if (!cells.some((value) => clean(value))) continue;
    result.total++;
    const line = r + 1;
    const name = (pick(cells, idx.name) || `${pick(cells, idx.first)} ${pick(cells, idx.last)}`.trim()).slice(0, 100);
    // The first phone column that holds a valid Saudi number wins (the mobile before the landline).
    const phoneCandidates = idx.phone.map((index) => clean(cells[index] ?? "")).filter(Boolean);
    const rawPhone = phoneCandidates.find((value) => isValidSaudiPhone(value)) ?? phoneCandidates[0] ?? "";
    if (!rawPhone) { result.invalid.push({ line, name, reason: "لا يوجد رقم جوال" }); continue; }
    if (!isValidSaudiPhone(rawPhone)) { result.invalid.push({ line, name, reason: `رقم غير صالح (${rawPhone})` }); continue; }
    const phone = leadWhatsappNumber(rawPhone);
    if (!phone) { result.invalid.push({ line, name, reason: `رقم غير صالح (${rawPhone})` }); continue; }
    if (seen.has(phone)) { result.duplicates++; continue; }
    seen.add(phone);

    const status = pick(cells, idx.status).slice(0, 80);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    result.valid.push({
      line,
      name: name || phone,
      phone,
      email: pick(cells, idx.email).slice(0, 160),
      status,
      project: pick(cells, idx.project).slice(0, 120),
      source: pick(cells, idx.source).slice(0, 120),
      createdAt: pick(cells, idx.created)
    });
  }
  result.statuses = [...statusCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  return result;
}

/** The pipeline stage a file's status most likely means: the stage of the same name, or the usual meaning of the common words. */
export function suggestStage(status: string, stages: readonly string[]): string {
  const value = status.trim();
  if (!value) return "جديد";
  if (stages.includes(value)) return value;
  if (/غير\s*مهتم|مرفوض|خسر|lost|not interested/i.test(value)) return "خسر";
  if (/تم البيع|مباع|فاز|won|closed won/i.test(value)) return "فاز";
  if (/حجز|reserved|booked/i.test(value)) return "تم الحجز";
  if (/عرض سعر|quote|proposal/i.test(value)) return "عرض سعر";
  if (/مؤهل|qualified/i.test(value)) return "مؤهل";
  if (/مهتم|interested/i.test(value)) return "مهتم";
  return "جديد";
}

function activityTime(value: string): string {
  const parsed = value ? new Date(value.replace(" ", "T")) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

export type ImportOutcome = { created: number; existing: number; failed: number };

/**
 * Saves the leads. A number that is already a customer is left alone (nothing is overwritten), so the same file can
 * be uploaded twice. `stageMap` says which pipeline stage each status of the file goes to; the stage is written
 * directly, so no event goes to Meta / TikTok / Snapchat.
 */
export async function importLeads(input: { tenantId: string; rows: ImportRow[]; stageMap: Record<string, string>; stages: readonly string[] }): Promise<ImportOutcome> {
  await ensureSchema();
  const outcome: ImportOutcome = { created: 0, existing: 0, failed: 0 };
  for (const row of input.rows) {
    try {
      const variants = [...new Set([row.phone, `0${row.phone.slice(3)}`, row.phone.slice(3), `+${row.phone}`])];
      const found = await prisma.customer.findFirst({ where: { tenantId: input.tenantId, phone: { in: variants } }, select: { id: true } });
      if (found) { outcome.existing++; continue; }

      const mapped = input.stageMap[row.status];
      const stage = mapped && input.stages.includes(mapped) ? mapped : suggestStage(row.status, input.stages);
      const at = activityTime(row.createdAt);
      const threadIds = whatsappThreadIds(input.tenantId, row.phone);
      const customerId = (await prisma.customer.findUnique({ where: { id: threadIds.customerId }, select: { id: true } })) ? `c-${randomUUID()}` : threadIds.customerId;
      const conversationId = (await prisma.conversation.findUnique({ where: { id: threadIds.conversationId }, select: { id: true } })) ? `c-${randomUUID()}` : threadIds.conversationId;
      const answers = [
        row.project ? { question: "المشروع", answer: row.project } : null,
        row.source ? { question: "مصدر العميل", answer: row.source } : null,
        row.status ? { question: "الحالة في النظام السابق", answer: row.status } : null
      ].filter(Boolean);

      await prisma.$transaction([
        prisma.customer.create({ data: { id: customerId, tenantId: input.tenantId, name: row.name, phone: row.phone, initial: row.name.slice(0, 1) } }),
        prisma.conversation.create({
          data: {
            id: conversationId,
            customerId,
            tenantId: input.tenantId,
            channel: "whatsapp",
            lastMessage: "عميل مستورد من ملف",
            status: "closed",
            assignee: "بدون موظف",
            unread: 0,
            windowExpired: 1,
            pipelineStage: stage,
            lastActivityAt: at
          }
        }),
        prisma.lead.create({
          data: {
            id: `lead-import-${createHash("sha1").update(`${input.tenantId}:${row.phone}`).digest("hex").slice(0, 24)}`,
            tenantId: input.tenantId,
            customerId,
            conversationId,
            source: row.source || "import",
            sourceId: "",
            formName: row.project,
            name: row.name,
            phone: row.phone,
            email: row.email,
            answersJson: JSON.stringify(answers),
            createdAt: at
          }
        })
      ]);
      const platform = platformFromLeadSource(row.source);
      if (platform) await recordFormAdSource({ tenantId: input.tenantId, conversationId, platform, headline: row.project || row.source });
      outcome.created++;
    } catch (error) {
      console.error("Lead import row failed", row.line, error);
      outcome.failed++;
    }
  }
  return outcome;
}
