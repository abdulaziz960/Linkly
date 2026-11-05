import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { recordLeadEvent } from "./lead-timeline";

/**
 * Site-visit appointments (the schedule).
 *
 * One table of visits - a day, a time, a customer, a project, who booked it (the AI or an employee) and
 * whether the customer came. A daily limit caps how many visits a day can hold: one number for the
 * workspace, optionally overridden per project. The limit is enforced in the INSERT itself, so two
 * bookings racing for the last place of a day can never both succeed.
 */

export const VISIT_STATUSES = ["محجوز", "تم الحضور", "لم يحضر", "ملغي"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
/** "محجوز" and "تم الحضور" take one of the day's places (the SQL below counts exactly those two); a cancelled or missed visit gives it back. */

export const DEFAULT_DAILY_LIMIT = 10;
const MAX_DAILY_LIMIT = 500;
const IS_POSTGRES = (process.env.DATABASE_URL ?? "").startsWith("postgres");
export const AI_BOOKER = "الذكاء الاصطناعي";

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_visit_settings (
      tenant_id TEXT PRIMARY KEY,
      daily_limit INTEGER NOT NULL DEFAULT ${DEFAULT_DAILY_LIMIT},
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_visits (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      conversation_id TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      visit_date TEXT NOT NULL,
      visit_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'محجوز',
      booked_by TEXT NOT NULL DEFAULT '',
      employee TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS crm_visits_tenant_date ON crm_visits (tenant_id, visit_date)`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type Visit = {
  id: string;
  projectId: string;
  projectName: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  status: string;
  bookedBy: string;
  employee: string;
  notes: string;
  createdAt: string;
};

type VisitRow = {
  id: string; project_id: string; project_name: string; conversation_id: string; customer_name: string; customer_phone: string;
  visit_date: string; visit_time: string; status: string; booked_by: string; employee: string; notes: string; created_at: string;
};
const COLUMNS = "id, project_id, project_name, conversation_id, customer_name, customer_phone, visit_date, visit_time, status, booked_by, employee, notes, created_at";

function toVisit(row: VisitRow): Visit {
  return {
    id: row.id, projectId: row.project_id, projectName: row.project_name, conversationId: row.conversation_id,
    customerName: row.customer_name, customerPhone: row.customer_phone, date: row.visit_date, time: row.visit_time,
    status: row.status, bookedBy: row.booked_by, employee: row.employee, notes: row.notes, createdAt: row.created_at
  };
}

/** Today's date in Riyadh as YYYY-MM-DD (the schedule is kept in local time). */
export function todayInRiyadh(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(now);
}

function riyadhMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function getVisitSettings(tenantId: string): Promise<{ dailyLimit: number }> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ daily_limit: number }>>`SELECT daily_limit FROM crm_visit_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  return { dailyLimit: rows[0]?.daily_limit ?? DEFAULT_DAILY_LIMIT };
}

export async function saveVisitSettings(tenantId: string, dailyLimitRaw: unknown): Promise<{ ok: true; dailyLimit: number } | { ok: false; error: string }> {
  const dailyLimit = Number(dailyLimitRaw);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > MAX_DAILY_LIMIT) return { ok: false, error: `حد الزيارات اليومي رقم من 1 إلى ${MAX_DAILY_LIMIT}` };
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM crm_visit_settings WHERE tenant_id = ${tenantId}`;
  await prisma.$executeRaw`INSERT INTO crm_visit_settings (tenant_id, daily_limit, updated_at) VALUES (${tenantId}, ${dailyLimit}, ${new Date().toISOString()})`;
  return { ok: true, dailyLimit };
}

/** The limit that applies to a project's day: its own when set, else the workspace's. */
export async function effectiveDailyLimit(tenantId: string, projectLimit: number | null | undefined): Promise<number> {
  if (projectLimit && projectLimit > 0) return projectLimit;
  return (await getVisitSettings(tenantId)).dailyLimit;
}

async function countForDay(tenantId: string, date: string, projectId: string | null): Promise<number> {
  await ensureTables();
  const rows = projectId
    ? await prisma.$queryRaw<Array<{ n: number | bigint }>>`SELECT COUNT(*) AS n FROM crm_visits WHERE tenant_id = ${tenantId} AND visit_date = ${date} AND status IN ('محجوز', 'تم الحضور') AND project_id = ${projectId}`
    : await prisma.$queryRaw<Array<{ n: number | bigint }>>`SELECT COUNT(*) AS n FROM crm_visits WHERE tenant_id = ${tenantId} AND visit_date = ${date} AND status IN ('محجوز', 'تم الحضور')`;
  return Number(rows[0]?.n ?? 0);
}

export type BookInput = {
  tenantId: string;
  date: string;
  time: string;
  customerName?: string;
  customerPhone?: string;
  conversationId?: string;
  projectId?: string;
  projectName?: string;
  /** The project's own daily limit, when it has one. */
  projectLimit?: number | null;
  bookedBy: string;
  employee?: string;
  notes?: string;
  /** Test hook / callers that already know "now". */
  now?: Date;
};

export type BookResult =
  | { ok: true; visit: Visit }
  | { ok: false; reason: "invalid_date" | "invalid_time" | "past" | "duplicate" | "day_full" | "no_customer"; message: string; limit?: number };

/**
 * Books a visit. The day's limit is part of the INSERT (insert ... select ... where the day still has
 * room), so concurrent bookings cannot overfill it. A customer cannot hold two visits on the same day.
 */
export async function bookVisit(input: BookInput): Promise<BookResult> {
  if (!isValidDate(input.date)) return { ok: false, reason: "invalid_date", message: "تاريخ الزيارة غير صالح" };
  if (!isValidTime(input.time)) return { ok: false, reason: "invalid_time", message: "وقت الزيارة غير صالح" };
  const now = input.now ?? new Date();
  const today = todayInRiyadh(now);
  if (input.date < today || (input.date === today && Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3)) <= riyadhMinutes(now))) {
    return { ok: false, reason: "past", message: "لا يمكن حجز موعد في وقت مضى" };
  }
  const phone = (input.customerPhone ?? "").trim().slice(0, 30);
  const name = (input.customerName ?? "").trim().slice(0, 100);
  if (!phone && !name) return { ok: false, reason: "no_customer", message: "اسم العميل أو جواله مطلوب" };

  await ensureTables();
  const projectId = input.projectId ?? "";
  const limit = await effectiveDailyLimit(input.tenantId, input.projectLimit);
  const id = `visit-${randomUUID()}`;
  const stamp = now.toISOString();
  // A project-specific limit counts that project's visits; the workspace limit counts every visit of the day.
  const scoped = Boolean(input.projectLimit && input.projectLimit > 0 && projectId);
  const projectName = (input.projectName ?? "").slice(0, 120);
  const bookedBy = input.bookedBy.slice(0, 100);
  const employee = (input.employee ?? "").slice(0, 100);
  const notes = (input.notes ?? "").slice(0, 500);
  const conversationId = input.conversationId ?? "";

  // Count-then-insert is not atomic under Postgres' default isolation: two bookings could both see room
  // for the last place. A per-(workspace, day) advisory lock makes the check and the insert one step.
  // SQLite (development and tests) has a single writer and the insert below is one atomic statement, so it
  // needs neither the lock nor an interactive transaction (which only times out when writers queue up).
  const attempt = async (tx: Pick<typeof prisma, "$queryRaw" | "$executeRaw">) => {
    if (IS_POSTGRES) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.date}`}))`;
    if (phone || conversationId) {
      const same = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_visits WHERE tenant_id = ${input.tenantId} AND visit_date = ${input.date} AND status IN ('محجوز', 'تم الحضور') AND ((customer_phone <> '' AND customer_phone = ${phone}) OR (conversation_id <> '' AND conversation_id = ${conversationId})) LIMIT 1`;
      if (same[0]) return "duplicate" as const;
    }
    const inserted = scoped
      ? await tx.$executeRaw`INSERT INTO crm_visits (id, tenant_id, project_id, project_name, conversation_id, customer_name, customer_phone, visit_date, visit_time, status, booked_by, employee, notes, created_at, updated_at)
          SELECT ${id}, ${input.tenantId}, ${projectId}, ${projectName}, ${conversationId}, ${name}, ${phone}, ${input.date}, ${input.time}, 'محجوز', ${bookedBy}, ${employee}, ${notes}, ${stamp}, ${stamp}
          WHERE (SELECT COUNT(*) FROM crm_visits WHERE tenant_id = ${input.tenantId} AND visit_date = ${input.date} AND status IN ('محجوز', 'تم الحضور') AND project_id = ${projectId}) < ${limit}`
      : await tx.$executeRaw`INSERT INTO crm_visits (id, tenant_id, project_id, project_name, conversation_id, customer_name, customer_phone, visit_date, visit_time, status, booked_by, employee, notes, created_at, updated_at)
          SELECT ${id}, ${input.tenantId}, ${projectId}, ${projectName}, ${conversationId}, ${name}, ${phone}, ${input.date}, ${input.time}, 'محجوز', ${bookedBy}, ${employee}, ${notes}, ${stamp}, ${stamp}
          WHERE (SELECT COUNT(*) FROM crm_visits WHERE tenant_id = ${input.tenantId} AND visit_date = ${input.date} AND status IN ('محجوز', 'تم الحضور')) < ${limit}`;
    return Number(inserted) === 1 ? ("booked" as const) : ("day_full" as const);
  };
  const outcome = IS_POSTGRES ? await prisma.$transaction(attempt, { maxWait: 10_000, timeout: 20_000 }) : await attempt(prisma);
  if (outcome === "duplicate") return { ok: false, reason: "duplicate", message: "لدى العميل زيارة محجوزة في هذا اليوم" };
  if (outcome === "day_full") return { ok: false, reason: "day_full", message: "اكتمل عدد الزيارات في هذا اليوم", limit };
  const rows = await prisma.$queryRawUnsafe<VisitRow[]>(`SELECT ${COLUMNS} FROM crm_visits WHERE id = $1`, id);
  const visit = toVisit(rows[0]);
  await recordLeadEvent({ tenantId: input.tenantId, conversationId, kind: "visit", text: `حجز زيارة ${visitLabel(visit)}`, actor: visit.bookedBy });
  return { ok: true, visit };
}

function visitLabel(visit: { date: string; time: string; projectName: string }) {
  return `يوم ${visit.date} الساعة ${visit.time}${visit.projectName ? ` (${visit.projectName})` : ""}`;
}

export async function listVisits(tenantId: string, range: { from?: string; to?: string } = {}): Promise<Visit[]> {
  await ensureTables();
  const from = isValidDate(range.from) ? range.from : "0000-01-01";
  const to = isValidDate(range.to) ? range.to : "9999-12-31";
  const rows = await prisma.$queryRawUnsafe<VisitRow[]>(`SELECT ${COLUMNS} FROM crm_visits WHERE tenant_id = $1 AND visit_date >= $2 AND visit_date <= $3 ORDER BY visit_date ASC, visit_time ASC LIMIT 1000`, tenantId, from, to);
  return rows.map(toVisit);
}

export async function upcomingVisitForCustomer(tenantId: string, input: { conversationId?: string; phone?: string }, now: Date = new Date()): Promise<Visit | null> {
  await ensureTables();
  const today = todayInRiyadh(now);
  const rows = await prisma.$queryRawUnsafe<VisitRow[]>(
    `SELECT ${COLUMNS} FROM crm_visits WHERE tenant_id = $1 AND visit_date >= $2 AND status = 'محجوز' AND ((conversation_id <> '' AND conversation_id = $3) OR (customer_phone <> '' AND customer_phone = $4)) ORDER BY visit_date ASC, visit_time ASC LIMIT 1`,
    tenantId, today, input.conversationId ?? "", (input.phone ?? "").trim()
  );
  return rows[0] ? toVisit(rows[0]) : null;
}

/**
 * Changes a visit's status. A cancelled or missed visit has given its place back, so it cannot silently take
 * it again (the day may be full by now): the customer is booked anew instead.
 */
export async function updateVisitStatus(tenantId: string, id: string, status: unknown, actor = ""): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof status !== "string" || !(VISIT_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "حالة غير صالحة" };
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<VisitRow[]>(`SELECT ${COLUMNS} FROM crm_visits WHERE id = $1 AND tenant_id = $2 LIMIT 1`, id, tenantId);
  if (!rows[0]) return { ok: false, error: "الزيارة غير موجودة" };
  const counted = (value: string) => value === "محجوز" || value === "تم الحضور";
  if (!counted(rows[0].status) && counted(status)) return { ok: false, error: "هذه الزيارة أُلغيت أو لم يحضر العميل فيها. احجز له موعدًا جديدًا." };
  await prisma.$executeRaw`UPDATE crm_visits SET status = ${status}, updated_at = ${new Date().toISOString()} WHERE id = ${id} AND tenant_id = ${tenantId}`;
  if (status !== rows[0].status) await recordLeadEvent({ tenantId, conversationId: rows[0].conversation_id, kind: "visit", text: `الزيارة ${visitLabel(toVisit(rows[0]))}: ${rows[0].status} ← ${status}`, actor });
  return { ok: true };
}

export async function deleteVisit(tenantId: string, id: string, actor = ""): Promise<boolean> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<VisitRow[]>(`SELECT ${COLUMNS} FROM crm_visits WHERE id = $1 AND tenant_id = $2 LIMIT 1`, id, tenantId);
  const removed = Number(await prisma.$executeRaw`DELETE FROM crm_visits WHERE id = ${id} AND tenant_id = ${tenantId}`) === 1;
  if (removed && rows[0]) await recordLeadEvent({ tenantId, conversationId: rows[0].conversation_id, kind: "visit", text: `حذف الزيارة ${visitLabel(toVisit(rows[0]))}`, actor });
  return removed;
}

export type DayAvailability = { date: string; booked: number; limit: number; left: number };

/** The next days that still have room (today included while it has not ended), for the AI to offer. */
export async function availableDays(tenantId: string, options: { projectId?: string; projectLimit?: number | null; days?: number; now?: Date } = {}): Promise<DayAvailability[]> {
  const now = options.now ?? new Date();
  const limit = await effectiveDailyLimit(tenantId, options.projectLimit);
  const scoped = Boolean(options.projectLimit && options.projectLimit > 0 && options.projectId);
  const result: DayAvailability[] = [];
  const base = new Date(`${todayInRiyadh(now)}T00:00:00Z`);
  for (let offset = 0; offset < (options.days ?? 14); offset += 1) {
    const date = new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    const booked = await countForDay(tenantId, date, scoped ? options.projectId! : null);
    result.push({ date, booked, limit, left: Math.max(0, limit - booked) });
  }
  return result;
}
