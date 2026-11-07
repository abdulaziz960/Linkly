import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { recordLeadEvent } from "./lead-timeline";
import { textSimilarity } from "./text-similarity";

/**
 * Project units (stock).
 *
 * A project has units. A row is either one unit of its own (total 1: "A1", a ground floor of 270 m², available /
 * reserved / sold - exactly like a developer's price sheet) or a type with a count ("فيلا 4 غرف", total 10, 7
 * available). A customer is linked to the unit they want (by an employee, or by the AI when they say so clearly).
 * When the customer's conversation moves to the closing stage "فاز" (sold) one unit is taken from the stock (a
 * reserved one first when nothing is available), and given back if the conversation leaves "فاز" again. The AI
 * answers availability questions from this stock.
 */

export const MAX_UNITS_PER_PROJECT = 500;
const MAX_TOTAL = 100_000;
const SOLD_STAGE = "فاز";

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_units (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT '',
      price_text TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    // Added after the table first shipped; a second run finds the column and the error is ignored.
    for (const column of ["kind TEXT NOT NULL DEFAULT ''", "model_name TEXT NOT NULL DEFAULT ''", "reserved INTEGER NOT NULL DEFAULT 0"]) {
      await prisma.$executeRawUnsafe(`ALTER TABLE crm_units ADD COLUMN ${column}`).catch(() => undefined);
    }
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS crm_units_project ON crm_units (tenant_id, project_id)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_conversation_unit (
      conversation_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      sold INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** `kind` is what the unit is ("دور أرضي"), `model` the group it belongs to ("A"); reserved units are held, not sold. */
export type CrmUnit = { id: string; projectId: string; name: string; kind: string; model: string; area: string; priceText: string; total: number; available: number; reserved: number };
type UnitRow = { id: string; project_id: string; name: string; kind: string; model_name: string; area: string; price_text: string; total: number; available: number; reserved: number };
const COLUMNS = "id, project_id, name, kind, model_name, area, price_text, total, available, reserved";
const toUnit = (row: UnitRow): CrmUnit => ({ id: row.id, projectId: row.project_id, name: row.name, kind: row.kind ?? "", model: row.model_name ?? "", area: row.area, priceText: row.price_text, total: Number(row.total), available: Number(row.available), reserved: Number(row.reserved ?? 0) });

export async function listUnits(tenantId: string, projectId?: string): Promise<CrmUnit[]> {
  await ensureTables();
  const rows = projectId
    ? await prisma.$queryRawUnsafe<UnitRow[]>(`SELECT ${COLUMNS} FROM crm_units WHERE tenant_id = $1 AND project_id = $2 ORDER BY created_at ASC`, tenantId, projectId)
    : await prisma.$queryRawUnsafe<UnitRow[]>(`SELECT ${COLUMNS} FROM crm_units WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 5000`, tenantId);
  return rows.map(toUnit);
}

async function getUnit(tenantId: string, id: string): Promise<CrmUnit | null> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<UnitRow[]>(`SELECT ${COLUMNS} FROM crm_units WHERE tenant_id = $1 AND id = $2 LIMIT 1`, tenantId, id);
  return rows[0] ? toUnit(rows[0]) : null;
}

export type UnitStatus = "available" | "reserved" | "sold";
/** `status` is for a single unit (total 1): it sets available / reserved to match. */
export type UnitInput = { name?: unknown; kind?: unknown; model?: unknown; area?: unknown; priceText?: unknown; total?: unknown; available?: unknown; reserved?: unknown; status?: unknown };

export function unitStatusOf(unit: Pick<CrmUnit, "total" | "available" | "reserved">): UnitStatus {
  return unit.available > 0 ? "available" : unit.reserved > 0 ? "reserved" : "sold";
}
function cleanStatus(value: unknown): UnitStatus | null {
  return value === "available" || value === "reserved" || value === "sold" ? value : null;
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
}
function cleanCount(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_TOTAL ? n : null;
}

export async function createUnit(tenantId: string, projectId: string, input: UnitInput): Promise<{ ok: true; unit: CrmUnit } | { ok: false; error: string; code: number }> {
  const projectExists = (await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_projects WHERE id = ${projectId} AND tenant_id = ${tenantId} LIMIT 1`.catch(() => []))[0];
  if (!projectExists) return { ok: false, error: "المشروع غير موجود", code: 404 };
  const name = cleanText(input.name, 80).replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "اسم الوحدة مطلوب (حرفان على الأقل)", code: 400 };
  const status = cleanStatus(input.status);
  const total = status && (input.total === undefined || input.total === "") ? 1 : cleanCount(input.total);
  if (total === null) return { ok: false, error: "العدد الكلي رقم صحيح من 0 إلى 100000", code: 400 };
  const counts = countsFor(total, status, input.available, input.reserved);
  if (!counts) return { ok: false, error: "المتاح لا يتجاوز العدد الكلي", code: 400 };
  const existing = await listUnits(tenantId, projectId);
  if (existing.length >= MAX_UNITS_PER_PROJECT) return { ok: false, error: `أقصى عدد للوحدات ${MAX_UNITS_PER_PROJECT}`, code: 400 };
  if (existing.some((unit) => unit.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "يوجد وحدة بهذا الاسم في المشروع", code: 409 };
  const id = `unit-${randomUUID()}`;
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO crm_units (id, tenant_id, project_id, name, kind, model_name, area, price_text, total, available, reserved, created_at, updated_at) VALUES (${id}, ${tenantId}, ${projectId}, ${name}, ${cleanText(input.kind, 60)}, ${cleanText(input.model, 40)}, ${cleanText(input.area, 60)}, ${cleanText(input.priceText, 80)}, ${total}, ${counts.available}, ${counts.reserved}, ${now}, ${now})`;
  return { ok: true, unit: (await getUnit(tenantId, id))! };
}

/** available / reserved for a row: from `status` (single unit) or the numbers given; nothing given means all available. */
function countsFor(total: number, status: UnitStatus | null, available: unknown, reserved: unknown): { available: number; reserved: number } | null {
  if (status) return { available: status === "available" ? total : 0, reserved: status === "reserved" ? total : 0 };
  const free = available === undefined || available === "" ? total : cleanCount(available);
  const held = reserved === undefined || reserved === "" ? 0 : cleanCount(reserved);
  if (free === null || held === null || free + held > total) return null;
  return { available: free, reserved: held };
}

export async function updateUnit(tenantId: string, id: string, input: UnitInput): Promise<{ ok: true; unit: CrmUnit } | { ok: false; error: string; code: number }> {
  const current = await getUnit(tenantId, id);
  if (!current) return { ok: false, error: "الوحدة غير موجودة", code: 404 };
  const name = input.name === undefined ? current.name : cleanText(input.name, 80).replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "اسم الوحدة مطلوب (حرفان على الأقل)", code: 400 };
  const total = input.total === undefined ? current.total : cleanCount(input.total);
  if (total === null) return { ok: false, error: "العدد الكلي رقم صحيح من 0 إلى 100000", code: 400 };
  const status = cleanStatus(input.status);
  const available = input.available === undefined ? Math.min(current.available, total) : input.available;
  const reserved = input.reserved === undefined ? Math.min(current.reserved, Math.max(0, total - (typeof available === "number" ? available : current.available))) : input.reserved;
  const counts = countsFor(total, status, available, reserved);
  if (!counts) return { ok: false, error: "المتاح لا يتجاوز العدد الكلي", code: 400 };
  if (name.toLowerCase() !== current.name.toLowerCase() && (await listUnits(tenantId, current.projectId)).some((unit) => unit.id !== id && unit.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "يوجد وحدة بهذا الاسم في المشروع", code: 409 };
  await prisma.$executeRaw`UPDATE crm_units SET name = ${name}, kind = ${input.kind === undefined ? current.kind : cleanText(input.kind, 60)}, model_name = ${input.model === undefined ? current.model : cleanText(input.model, 40)}, area = ${input.area === undefined ? current.area : cleanText(input.area, 60)}, price_text = ${input.priceText === undefined ? current.priceText : cleanText(input.priceText, 80)}, total = ${total}, available = ${counts.available}, reserved = ${counts.reserved}, updated_at = ${new Date().toISOString()} WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return { ok: true, unit: (await getUnit(tenantId, id))! };
}

/**
 * Adds or updates many units at once (a price sheet): a row whose name already exists in the project is updated,
 * the others are created. All or nothing: if any row is invalid or the project would pass its limit, nothing changes.
 */
export async function importUnits(tenantId: string, projectId: string, rows: UnitInput[]): Promise<{ ok: true; created: number; updated: number } | { ok: false; error: string; code: number }> {
  const projectExists = (await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_projects WHERE id = ${projectId} AND tenant_id = ${tenantId} LIMIT 1`.catch(() => []))[0];
  if (!projectExists) return { ok: false, error: "المشروع غير موجود", code: 404 };
  if (!rows.length) return { ok: false, error: "لا توجد وحدات للاستيراد", code: 400 };
  const existing = await listUnits(tenantId, projectId);
  const byName = new Map(existing.map((unit) => [unit.name.toLowerCase(), unit]));
  const planned: Array<{ id: string | null; name: string; kind: string; model: string; area: string; priceText: string; total: number; available: number; reserved: number }> = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const name = cleanText(row.name, 80).replace(/\s+/g, " ");
    if (!name) return { ok: false, error: `الصف ${index + 1}: اسم الوحدة مطلوب`, code: 400 };
    if (seen.has(name.toLowerCase())) return { ok: false, error: `الاسم «${name}» مكرر في الملف`, code: 400 };
    seen.add(name.toLowerCase());
    const status = cleanStatus(row.status);
    // A sheet row is one unit unless it says otherwise.
    const total = row.total === undefined || row.total === "" ? 1 : cleanCount(row.total);
    if (total === null) return { ok: false, error: `الصف ${index + 1} («${name}»): العدد الكلي غير صالح`, code: 400 };
    const counts = countsFor(total, status, row.available, row.reserved);
    if (!counts) return { ok: false, error: `الصف ${index + 1} («${name}»): المتاح والمحجوز يتجاوزان العدد الكلي`, code: 400 };
    planned.push({ id: byName.get(name.toLowerCase())?.id ?? null, name, kind: cleanText(row.kind, 60), model: cleanText(row.model, 40), area: cleanText(row.area, 60), priceText: cleanText(row.priceText, 80), total, ...counts });
  }
  const creating = planned.filter((unit) => !unit.id).length;
  if (existing.length + creating > MAX_UNITS_PER_PROJECT) return { ok: false, error: `أقصى عدد للوحدات ${MAX_UNITS_PER_PROJECT}`, code: 400 };
  const now = new Date().toISOString();
  await prisma.$transaction(async (tx) => {
    for (const unit of planned) {
      if (unit.id) {
        await tx.$executeRaw`UPDATE crm_units SET kind = ${unit.kind}, model_name = ${unit.model}, area = ${unit.area}, price_text = ${unit.priceText}, total = ${unit.total}, available = ${unit.available}, reserved = ${unit.reserved}, updated_at = ${now} WHERE id = ${unit.id} AND tenant_id = ${tenantId}`;
      } else {
        await tx.$executeRaw`INSERT INTO crm_units (id, tenant_id, project_id, name, kind, model_name, area, price_text, total, available, reserved, created_at, updated_at) VALUES (${`unit-${randomUUID()}`}, ${tenantId}, ${projectId}, ${unit.name}, ${unit.kind}, ${unit.model}, ${unit.area}, ${unit.priceText}, ${unit.total}, ${unit.available}, ${unit.reserved}, ${now}, ${now})`;
      }
    }
  });
  return { ok: true, created: creating, updated: planned.length - creating };
}

export async function deleteUnit(tenantId: string, id: string): Promise<boolean> {
  await ensureTables();
  const removed = Number(await prisma.$executeRaw`DELETE FROM crm_units WHERE id = ${id} AND tenant_id = ${tenantId}`) === 1;
  if (removed) await prisma.$executeRaw`DELETE FROM crm_conversation_unit WHERE unit_id = ${id} AND tenant_id = ${tenantId}`;
  return removed;
}

/** Deletes a project's units with it (called when the project is removed). */
export async function deleteUnitsOfProject(tenantId: string, projectId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM crm_conversation_unit WHERE tenant_id = ${tenantId} AND unit_id IN (SELECT id FROM crm_units WHERE tenant_id = ${tenantId} AND project_id = ${projectId})`;
  await prisma.$executeRaw`DELETE FROM crm_units WHERE tenant_id = ${tenantId} AND project_id = ${projectId}`;
}

export type ConversationUnit = { unitId: string; name: string; sold: boolean } | null;

export async function getConversationUnit(tenantId: string, conversationId: string): Promise<ConversationUnit> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ unit_id: string; sold: number; name: string }>>`SELECT cu.unit_id AS unit_id, cu.sold AS sold, u.name AS name FROM crm_conversation_unit cu JOIN crm_units u ON u.id = cu.unit_id WHERE cu.conversation_id = ${conversationId} AND cu.tenant_id = ${tenantId} LIMIT 1`;
  return rows[0] ? { unitId: rows[0].unit_id, name: rows[0].name, sold: rows[0].sold === 1 } : null;
}

/** Links a conversation to the unit type its customer wants (null clears it). A sold link cannot be changed. */
export async function setConversationUnit(tenantId: string, conversationId: string, unitId: string | null, actor = ""): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  await ensureTables();
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { id: true } });
  if (!conversation) return { ok: false, error: "العميل غير موجود", code: 404 };
  const current = await getConversationUnit(tenantId, conversationId);
  if (current?.sold && current.unitId !== unitId) return { ok: false, error: "بيعت وحدة لهذا العميل، أعده من «تم البيع» أولًا لتغيير الوحدة", code: 409 };
  if (unitId === null) {
    await prisma.$executeRaw`DELETE FROM crm_conversation_unit WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId}`;
    return { ok: true };
  }
  const unit = await getUnit(tenantId, unitId);
  if (!unit) return { ok: false, error: "نوع الوحدة غير موجود", code: 404 };
  if (current?.unitId === unitId) return { ok: true };
  await prisma.$executeRaw`DELETE FROM crm_conversation_unit WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId}`;
  await prisma.$executeRaw`INSERT INTO crm_conversation_unit (conversation_id, tenant_id, unit_id, sold, updated_at) VALUES (${conversationId}, ${tenantId}, ${unitId}, 0, ${new Date().toISOString()})`;
  await recordLeadEvent({ tenantId, conversationId, kind: "unit", text: `الوحدة المهتم بها: ${unit.name}`, actor });
  return { ok: true };
}

/**
 * The stock follows the stage: entering "فاز" takes one unit of the customer's type, leaving it gives the unit back.
 * Never throws (the stage change is already saved); says in the timeline what happened.
 */
export async function applyUnitOnStageChange(input: { tenantId: string; conversationId: string; from: string; to: string; actor?: string }) {
  try {
    if (input.from === input.to) return;
    await ensureTables();
    const { tenantId, conversationId } = input;
    const actor = input.actor ?? "";
    if (input.to === SOLD_STAGE && input.from !== SOLD_STAGE) {
      const link = await getConversationUnit(tenantId, conversationId);
      if (!link) {
        const hasStock = (await prisma.$queryRaw<Array<{ n: number | bigint }>>`SELECT COUNT(*) AS n FROM crm_units WHERE tenant_id = ${tenantId}`)[0];
        if (Number(hasStock?.n ?? 0) > 0) await recordLeadEvent({ tenantId, conversationId, kind: "unit", text: "لم تُحدَّد وحدة لهذا العميل، فلم يُخصم شيء من المخزون", actor });
        return;
      }
      // Claim the sale first so a repeated change cannot take two units.
      const claimed = await prisma.$executeRaw`UPDATE crm_conversation_unit SET sold = 1, updated_at = ${new Date().toISOString()} WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId} AND sold = 0`;
      if (Number(claimed) !== 1) return;
      let taken = await prisma.$executeRaw`UPDATE crm_units SET available = available - 1, updated_at = ${new Date().toISOString()} WHERE id = ${link.unitId} AND tenant_id = ${tenantId} AND available > 0`;
      // A unit that was only reserved becomes sold.
      if (Number(taken) !== 1) taken = await prisma.$executeRaw`UPDATE crm_units SET reserved = reserved - 1, updated_at = ${new Date().toISOString()} WHERE id = ${link.unitId} AND tenant_id = ${tenantId} AND available = 0 AND reserved > 0`;
      if (Number(taken) !== 1) {
        await prisma.$executeRaw`UPDATE crm_conversation_unit SET sold = 0 WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId}`;
        await recordLeadEvent({ tenantId, conversationId, kind: "unit", text: `لا يوجد متاح من «${link.name}»، فلم يُخصم شيء من المخزون`, actor });
        return;
      }
      const left = (await getUnit(tenantId, link.unitId))?.available ?? 0;
      await recordLeadEvent({ tenantId, conversationId, kind: "unit", text: `بيعت وحدة «${link.name}» (المتاح الآن ${left})`, actor });
    } else if (input.from === SOLD_STAGE && input.to !== SOLD_STAGE) {
      const link = await getConversationUnit(tenantId, conversationId);
      if (!link?.sold) return;
      const released = await prisma.$executeRaw`UPDATE crm_conversation_unit SET sold = 0, updated_at = ${new Date().toISOString()} WHERE conversation_id = ${conversationId} AND tenant_id = ${tenantId} AND sold = 1`;
      if (Number(released) !== 1) return;
      await prisma.$executeRaw`UPDATE crm_units SET available = available + 1, updated_at = ${new Date().toISOString()} WHERE id = ${link.unitId} AND tenant_id = ${tenantId} AND available + reserved < total`;
      await recordLeadEvent({ tenantId, conversationId, kind: "unit", text: `أُعيدت وحدة «${link.name}» إلى المخزون`, actor });
    }
  } catch (error) {
    console.error("Unit stock update failed", error);
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[ً-ٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
}

/** The unit type of a project a name points to (exact, else the closest above a clear threshold). */
export function matchUnit(units: CrmUnit[], name: string): CrmUnit | null {
  const wanted = normalize(name);
  if (!wanted) return null;
  const exact = units.find((unit) => normalize(unit.name) === wanted);
  if (exact) return exact;
  let best: { unit: CrmUnit; score: number } | null = null;
  for (const unit of units) {
    const score = textSimilarity(wanted, normalize(unit.name));
    if (score >= 0.6 && (!best || score > best.score)) best = { unit, score };
  }
  return best?.unit ?? null;
}

/** The project's stock as facts for the AI. */
export function unitsBrief(units: CrmUnit[]): string {
  if (!units.length) return "";
  const line = (unit: CrmUnit) => {
    const label = [unit.name, unit.kind ? `(${unit.kind})` : "", unit.model ? `model ${unit.model}` : ""].filter(Boolean).join(" ");
    const facts = [unit.area, unit.priceText].filter(Boolean).join(" · ");
    const state = unit.total === 1
      ? { available: "available", reserved: "reserved (not available)", sold: "sold (not available)" }[unitStatusOf(unit)]
      : unit.available > 0 ? `${unit.available} available of ${unit.total}${unit.reserved ? `, ${unit.reserved} reserved` : ""}` : `sold out (0 of ${unit.total})`;
    return `- ${label}${facts ? ` · ${facts}` : ""}: ${state}`;
  };
  return ["Units of this project (real stock - answer availability and price questions from this list only; never offer a reserved or sold unit):", ...units.map(line)].join("\n");
}

/** Stock totals per project, for the report. */
export async function inventoryByProject(tenantId: string): Promise<Array<{ projectId: string; total: number; available: number; reserved: number; sold: number }>> {
  const units = await listUnits(tenantId);
  const map = new Map<string, { projectId: string; total: number; available: number; reserved: number; sold: number }>();
  for (const unit of units) {
    const row = map.get(unit.projectId) ?? { projectId: unit.projectId, total: 0, available: 0, reserved: 0, sold: 0 };
    row.total += unit.total;
    row.available += unit.available;
    row.reserved += unit.reserved;
    row.sold += unit.total - unit.available - unit.reserved;
    map.set(unit.projectId, row);
  }
  return [...map.values()];
}
