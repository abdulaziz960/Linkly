import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import {
  DEFAULT_PAYMENT_TERMS, DEFAULT_QUOTE_SERVICES, DEFAULT_VALIDITY_DAYS, DEFAULT_VAT_RATE, QUOTE_STATUSES, addDays, adminCanMove, clientCanAnswer,
  formatQuoteNumber, quoteTotals, statusAfterClientAnswer, todayInRiyadh,
  type ClientAnswer, type QuoteLineInput, type QuoteServiceDef, type QuoteStatus, type ServiceField
} from "./model";

// Quotations live in their own tables, created the first time they are used (the same way the workspaces tables are), with
// SQL that runs on both SQLite (local, tests) and Postgres (production).

let ready: Promise<void> | null = null;
export function ensureQuotesSchema(): Promise<void> {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS quote_services (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, default_price_halalas INTEGER NOT NULL DEFAULT 0, description_template TEXT NOT NULL DEFAULT '',
      line_name_template TEXT NOT NULL DEFAULT '', fields_json TEXT NOT NULL DEFAULT '[]', terms_json TEXT NOT NULL DEFAULT '[]',
      price_formula TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY, number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', token TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL, contact_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
      vat_number TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', logo_data_url TEXT NOT NULL DEFAULT '',
      billing_cycle TEXT NOT NULL DEFAULT 'شهري', validity_days INTEGER NOT NULL DEFAULT 7, eyebrow TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '', terms_json TEXT NOT NULL DEFAULT '[]',
      payment_terms TEXT NOT NULL DEFAULT '', salesperson TEXT NOT NULL DEFAULT '', issued_on TEXT NOT NULL, valid_until TEXT NOT NULL,
      subtotal_halalas INTEGER NOT NULL DEFAULT 0, vat_halalas INTEGER NOT NULL DEFAULT 0, total_halalas INTEGER NOT NULL DEFAULT 0,
      change_note TEXT NOT NULL DEFAULT '', sent_at TEXT NOT NULL DEFAULT '', decided_at TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS quotes_number_key ON quotes(number)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS quotes_token_idx ON quotes(token)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS quote_lines (
      id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, service_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, unit_price_halalas INTEGER NOT NULL DEFAULT 0,
      vat_rate INTEGER NOT NULL DEFAULT 15, fields_json TEXT NOT NULL DEFAULT '{}'
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS quote_lines_quote_idx ON quote_lines(quote_id)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS quote_events (
      id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS quote_events_quote_idx ON quote_events(quote_id)`);
  })().catch((error) => { ready = null; throw error; });
  return ready;
}

export type QuoteInput = {
  customerName: string; contactName: string; email: string; phone: string; vatNumber: string; address: string; logoDataUrl: string;
  billingCycle: "شهري" | "سنوي"; validityDays: number; eyebrow: string; headline: string; subtitle: string; terms: string[];
  paymentTerms: string; salesperson: string; lines: QuoteLineInput[];
};

export type QuoteRecord = QuoteInput & {
  id: string; number: string; status: QuoteStatus; token: string; issuedOn: string; validUntil: string;
  subtotalHalalas: number; vatHalalas: number; totalHalalas: number; changeNote: string; sentAt: string; decidedAt: string;
  createdBy: string; createdAt: string; updatedAt: string;
};

export type QuoteEvent = { id: string; kind: string; actor: string; note: string; createdAt: string };

type QuoteRow = {
  id: string; number: string; status: string; token: string; customer_name: string; contact_name: string; email: string; phone: string; vat_number: string;
  address: string; logo_data_url: string; billing_cycle: string; validity_days: number; eyebrow: string; headline: string; subtitle: string; terms_json: string;
  payment_terms: string; salesperson: string; issued_on: string; valid_until: string; subtotal_halalas: number; vat_halalas: number; total_halalas: number;
  change_note: string; sent_at: string; decided_at: string; created_by: string; created_at: string; updated_at: string;
};
type LineRow = { id: string; quote_id: string; position: number; service_id: string; name: string; description: string; quantity: number; unit_price_halalas: number; vat_rate: number; fields_json: string };

function parseJson<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

function rowToQuote(row: QuoteRow, lines: LineRow[]): QuoteRecord {
  return {
    id: row.id, number: row.number, status: (QUOTE_STATUSES as readonly string[]).includes(row.status) ? (row.status as QuoteStatus) : "draft", token: row.token,
    customerName: row.customer_name, contactName: row.contact_name, email: row.email, phone: row.phone, vatNumber: row.vat_number, address: row.address,
    logoDataUrl: row.logo_data_url, billingCycle: row.billing_cycle === "سنوي" ? "سنوي" : "شهري", validityDays: Number(row.validity_days), eyebrow: row.eyebrow,
    headline: row.headline, subtitle: row.subtitle, terms: parseJson<string[]>(row.terms_json, []), paymentTerms: row.payment_terms, salesperson: row.salesperson,
    issuedOn: row.issued_on, validUntil: row.valid_until, subtotalHalalas: Number(row.subtotal_halalas), vatHalalas: Number(row.vat_halalas), totalHalalas: Number(row.total_halalas),
    changeNote: row.change_note, sentAt: row.sent_at, decidedAt: row.decided_at, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    lines: lines.sort((a, b) => a.position - b.position).map((line) => ({
      serviceId: line.service_id, name: line.name, description: line.description, quantity: Number(line.quantity), unitPriceHalalas: Number(line.unit_price_halalas),
      vatRate: Number(line.vat_rate), fields: parseJson<Record<string, string>>(line.fields_json, {})
    }))
  };
}

// ---- services ----

type ServiceRow = { id: string; name: string; default_price_halalas: number; description_template: string; line_name_template: string; fields_json: string; terms_json: string; price_formula: string; active: number; position: number };

function rowToService(row: ServiceRow): QuoteServiceDef {
  return {
    id: row.id, name: row.name, defaultPriceHalalas: Number(row.default_price_halalas), descriptionTemplate: row.description_template,
    lineNameTemplate: row.line_name_template, fields: parseJson<ServiceField[]>(row.fields_json, []), terms: parseJson<string[]>(row.terms_json, []),
    priceFormula: row.price_formula === "messages_times_fees" ? "messages_times_fees" : "", active: Number(row.active) === 1, position: Number(row.position)
  };
}

export async function listQuoteServices(includeInactive = false): Promise<QuoteServiceDef[]> {
  await ensureQuotesSchema();
  const count = (await prisma.$queryRaw<Array<{ n: number | bigint }>>`SELECT COUNT(*) AS n FROM quote_services`)[0];
  if (Number(count?.n ?? 0) === 0) {
    const now = new Date().toISOString();
    for (const [index, service] of DEFAULT_QUOTE_SERVICES.entries()) {
      await prisma.$executeRaw`INSERT INTO quote_services (id, name, default_price_halalas, description_template, line_name_template, fields_json, terms_json, price_formula, active, position, created_at)
        VALUES (${`qsv-${randomUUID()}`}, ${service.name}, ${service.defaultPriceHalalas}, ${service.descriptionTemplate}, ${service.lineNameTemplate}, ${JSON.stringify(service.fields)}, ${JSON.stringify(service.terms)}, ${service.priceFormula}, 1, ${index}, ${now})`;
    }
  }
  const rows = await prisma.$queryRaw<ServiceRow[]>`SELECT * FROM quote_services ORDER BY position ASC, created_at ASC`;
  return rows.map(rowToService).filter((service) => includeInactive || service.active);
}

export type ServiceInput = { name: string; defaultPriceHalalas: number; descriptionTemplate: string; lineNameTemplate: string; terms: string[]; active: boolean };

export async function saveQuoteService(id: string | null, input: ServiceInput): Promise<string> {
  await ensureQuotesSchema();
  const terms = JSON.stringify(input.terms);
  if (id) {
    const changed = await prisma.$executeRaw`UPDATE quote_services SET name = ${input.name}, default_price_halalas = ${input.defaultPriceHalalas}, description_template = ${input.descriptionTemplate},
      line_name_template = ${input.lineNameTemplate}, terms_json = ${terms}, active = ${input.active ? 1 : 0} WHERE id = ${id}`;
    if (!changed) throw new Error("الخدمة غير موجودة");
    return id;
  }
  await listQuoteServices(true);
  const next = `qsv-${randomUUID()}`;
  const max = (await prisma.$queryRaw<Array<{ p: number | bigint | null }>>`SELECT MAX(position) AS p FROM quote_services`)[0]?.p;
  await prisma.$executeRaw`INSERT INTO quote_services (id, name, default_price_halalas, description_template, line_name_template, fields_json, terms_json, price_formula, active, position, created_at)
    VALUES (${next}, ${input.name}, ${input.defaultPriceHalalas}, ${input.descriptionTemplate}, ${input.lineNameTemplate || input.name}, '[]', ${terms}, '', ${input.active ? 1 : 0}, ${Number(max ?? -1) + 1}, ${new Date().toISOString()})`;
  return next;
}

// ---- quotes ----

async function nextNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ number: string }>>`SELECT number FROM quotes`;
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.number.replace(/\D/g, "")) || 0), 0);
  return formatQuoteNumber(highest + 1);
}

async function insertLines(quoteId: string, lines: QuoteLineInput[]) {
  for (const [index, line] of lines.entries()) {
    await prisma.$executeRaw`INSERT INTO quote_lines (id, quote_id, position, service_id, name, description, quantity, unit_price_halalas, vat_rate, fields_json)
      VALUES (${`qln-${randomUUID()}`}, ${quoteId}, ${index}, ${line.serviceId}, ${line.name}, ${line.description}, ${line.quantity}, ${line.unitPriceHalalas}, ${line.vatRate}, ${JSON.stringify(line.fields)})`;
  }
}

export async function recordQuoteEvent(quoteId: string, kind: string, actor: string, note = "") {
  await ensureQuotesSchema();
  await prisma.$executeRaw`INSERT INTO quote_events (id, quote_id, kind, actor, note, created_at) VALUES (${`qev-${randomUUID()}`}, ${quoteId}, ${kind}, ${actor}, ${note.slice(0, 1000)}, ${new Date().toISOString()})`;
}

export async function createQuote(input: QuoteInput, actor: string): Promise<QuoteRecord> {
  await ensureQuotesSchema();
  const totals = quoteTotals(input.lines);
  const issuedOn = todayInRiyadh();
  const now = new Date().toISOString();
  const id = `quo-${randomUUID()}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const number = await nextNumber();
      await prisma.$executeRaw`INSERT INTO quotes (id, number, status, token, customer_name, contact_name, email, phone, vat_number, address, logo_data_url, billing_cycle, validity_days,
        eyebrow, headline, subtitle, terms_json, payment_terms, salesperson, issued_on, valid_until, subtotal_halalas, vat_halalas, total_halalas, created_by, created_at, updated_at)
        VALUES (${id}, ${number}, 'draft', '', ${input.customerName}, ${input.contactName}, ${input.email}, ${input.phone}, ${input.vatNumber}, ${input.address}, ${input.logoDataUrl}, ${input.billingCycle}, ${input.validityDays},
        ${input.eyebrow}, ${input.headline}, ${input.subtitle}, ${JSON.stringify(input.terms)}, ${input.paymentTerms || DEFAULT_PAYMENT_TERMS}, ${input.salesperson}, ${issuedOn}, ${addDays(issuedOn, input.validityDays)},
        ${totals.subtotalHalalas}, ${totals.vatHalalas}, ${totals.totalHalalas}, ${actor}, ${now}, ${now})`;
      await insertLines(id, input.lines);
      await recordQuoteEvent(id, "created", actor);
      return (await getQuote(id))!;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("تعذر إنشاء عرض السعر");
}

export async function getQuote(id: string): Promise<QuoteRecord | null> {
  await ensureQuotesSchema();
  const row = (await prisma.$queryRaw<QuoteRow[]>`SELECT * FROM quotes WHERE id = ${id}`)[0];
  if (!row) return null;
  return rowToQuote(row, await prisma.$queryRaw<LineRow[]>`SELECT * FROM quote_lines WHERE quote_id = ${id}`);
}

export async function getQuoteByToken(token: string): Promise<QuoteRecord | null> {
  await ensureQuotesSchema();
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const row = (await prisma.$queryRaw<QuoteRow[]>`SELECT * FROM quotes WHERE token = ${token}`)[0];
  if (!row) return null;
  return rowToQuote(row, await prisma.$queryRaw<LineRow[]>`SELECT * FROM quote_lines WHERE quote_id = ${row.id}`);
}

export async function listQuoteEvents(quoteId: string): Promise<QuoteEvent[]> {
  await ensureQuotesSchema();
  const rows = await prisma.$queryRaw<Array<{ id: string; kind: string; actor: string; note: string; created_at: string }>>`SELECT * FROM quote_events WHERE quote_id = ${quoteId} ORDER BY created_at DESC`;
  return rows.map((row) => ({ id: row.id, kind: row.kind, actor: row.actor, note: row.note, createdAt: row.created_at }));
}

export async function listQuotes(): Promise<Array<Omit<QuoteRecord, "lines" | "logoDataUrl" | "token"> & { lineNames: string[] }>> {
  await ensureQuotesSchema();
  const rows = await prisma.$queryRaw<QuoteRow[]>`SELECT * FROM quotes ORDER BY created_at DESC`;
  const lines = await prisma.$queryRaw<LineRow[]>`SELECT * FROM quote_lines`;
  return rows.map((row) => {
    const { lines: ownLines, logoDataUrl: _logo, token: _token, ...rest } = rowToQuote(row, lines.filter((line) => line.quote_id === row.id));
    void _logo; void _token;
    return { ...rest, lineNames: ownLines.map((line) => line.name) };
  });
}

export type UpdateResult = { ok: true; quote: QuoteRecord } | { ok: false; error: string; status: number };

/** Edits a quote that is still being written (a draft, or one the client asked to change, which goes back to draft). */
export async function updateQuote(id: string, input: QuoteInput, actor: string): Promise<UpdateResult> {
  const current = await getQuote(id);
  if (!current) return { ok: false, error: "عرض السعر غير موجود", status: 404 };
  if (current.status !== "draft" && current.status !== "needs_changes") return { ok: false, error: "لا يمكن تعديل عرض أُرسل أو اعتُمد أو أُلغي", status: 409 };
  const totals = quoteTotals(input.lines);
  const validUntil = addDays(current.issuedOn, input.validityDays);
  await prisma.$executeRaw`UPDATE quotes SET status = 'draft', customer_name = ${input.customerName}, contact_name = ${input.contactName}, email = ${input.email}, phone = ${input.phone},
    vat_number = ${input.vatNumber}, address = ${input.address}, logo_data_url = ${input.logoDataUrl}, billing_cycle = ${input.billingCycle}, validity_days = ${input.validityDays},
    eyebrow = ${input.eyebrow}, headline = ${input.headline}, subtitle = ${input.subtitle}, terms_json = ${JSON.stringify(input.terms)}, payment_terms = ${input.paymentTerms || DEFAULT_PAYMENT_TERMS},
    salesperson = ${input.salesperson}, valid_until = ${validUntil}, subtotal_halalas = ${totals.subtotalHalalas}, vat_halalas = ${totals.vatHalalas}, total_halalas = ${totals.totalHalalas},
    updated_at = ${new Date().toISOString()} WHERE id = ${id}`;
  await prisma.$executeRaw`DELETE FROM quote_lines WHERE quote_id = ${id}`;
  await insertLines(id, input.lines);
  await recordQuoteEvent(id, "edited", actor);
  return { ok: true, quote: (await getQuote(id))! };
}

/** Marks a quote as sent and gives it its link. Sending again after changes issues a new link and starts the validity again. */
export async function markQuoteSent(id: string, actor: string): Promise<UpdateResult> {
  const current = await getQuote(id);
  if (!current) return { ok: false, error: "عرض السعر غير موجود", status: 404 };
  if (!adminCanMove(current.status, "sent")) return { ok: false, error: "لا يمكن إرسال هذا العرض في حالته الحالية", status: 409 };
  const token = randomBytes(32).toString("base64url");
  const issuedOn = todayInRiyadh();
  const changed = await prisma.$executeRaw`UPDATE quotes SET status = 'sent', token = ${token}, issued_on = ${issuedOn}, valid_until = ${addDays(issuedOn, current.validityDays)},
    sent_at = ${new Date().toISOString()}, change_note = '', updated_at = ${new Date().toISOString()} WHERE id = ${id} AND status = ${current.status}`;
  if (!changed) return { ok: false, error: "تغيّرت حالة العرض، أعد المحاولة", status: 409 };
  await recordQuoteEvent(id, "sent", actor, current.email);
  return { ok: true, quote: (await getQuote(id))! };
}

export async function cancelQuote(id: string, actor: string): Promise<UpdateResult> {
  const current = await getQuote(id);
  if (!current) return { ok: false, error: "عرض السعر غير موجود", status: 404 };
  if (!adminCanMove(current.status, "cancelled")) return { ok: false, error: "لا يمكن إلغاء هذا العرض", status: 409 };
  const changed = await prisma.$executeRaw`UPDATE quotes SET status = 'cancelled', decided_at = ${new Date().toISOString()}, updated_at = ${new Date().toISOString()} WHERE id = ${id} AND status = ${current.status}`;
  if (!changed) return { ok: false, error: "تغيّرت حالة العرض، أعد المحاولة", status: 409 };
  await recordQuoteEvent(id, "cancelled", actor);
  return { ok: true, quote: (await getQuote(id))! };
}

/** The client's answer from the link. It only counts for a quote that was sent and has not expired, and only once. */
export async function answerQuote(token: string, answer: ClientAnswer, note: string): Promise<UpdateResult> {
  const current = await getQuoteByToken(token);
  if (!current) return { ok: false, error: "الرابط غير صالح", status: 404 };
  if (!clientCanAnswer(current.status, current.validUntil)) return { ok: false, error: current.status === "sent" ? "انتهت صلاحية العرض" : "تم الرد على هذا العرض مسبقًا", status: 409 };
  const next = statusAfterClientAnswer(answer);
  const changed = await prisma.$executeRaw`UPDATE quotes SET status = ${next}, decided_at = ${new Date().toISOString()}, change_note = ${answer === "request_changes" ? note.slice(0, 1000) : ""},
    updated_at = ${new Date().toISOString()} WHERE id = ${current.id} AND status = 'sent'`;
  if (!changed) return { ok: false, error: "تم الرد على هذا العرض مسبقًا", status: 409 };
  await recordQuoteEvent(current.id, answer === "approve" ? "approved" : answer === "decline" ? "declined" : "changes_requested", "العميل", note);
  return { ok: true, quote: (await getQuote(current.id))! };
}

export { DEFAULT_VALIDITY_DAYS, DEFAULT_VAT_RATE };
