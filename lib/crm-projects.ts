import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { textSimilarity } from "./text-similarity";

/**
 * Project profiles for the CRM / AI.
 *
 * Each project has a name (and other names customers use for it), where it is, its price range, and a free
 * "details" text - everything a salesperson would know: units, areas, features, payment plans, delivery. When a
 * customer asks about a project, the AI reads that project's profile and answers from it. A project can also
 * carry its own daily visit limit (lib/crm-visits.ts).
 */

export const MAX_PROJECTS = 100;
export const MAX_DETAILS = 8000;

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL DEFAULT '',
      price_text TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      daily_visit_limit INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS crm_projects_tenant ON crm_projects (tenant_id)`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type CrmProject = {
  id: string;
  name: string;
  aliases: string;
  active: boolean;
  location: string;
  priceText: string;
  details: string;
  dailyVisitLimit: number | null;
  updatedAt: string;
};
type Row = { id: string; name: string; aliases: string; active: number; location: string; price_text: string; details: string; daily_visit_limit: number | null; updated_at: string };
const COLUMNS = "id, name, aliases, active, location, price_text, details, daily_visit_limit, updated_at";
const toProject = (row: Row): CrmProject => ({
  id: row.id, name: row.name, aliases: row.aliases, active: row.active === 1, location: row.location,
  priceText: row.price_text, details: row.details, dailyVisitLimit: row.daily_visit_limit === null ? null : Number(row.daily_visit_limit), updatedAt: row.updated_at
});

export type ProjectInput = { name?: unknown; aliases?: unknown; active?: unknown; location?: unknown; priceText?: unknown; details?: unknown; dailyVisitLimit?: unknown };
type Clean = { name?: string; aliases?: string; active?: boolean; location?: string; priceText?: string; details?: string; dailyVisitLimit?: number | null };

export function cleanProjectInput(input: ProjectInput, requireName: boolean): { ok: true; data: Clean } | { ok: false; error: string } {
  const data: Clean = {};
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
  if (input.name !== undefined || requireName) {
    const name = text(input.name, 80).replace(/\s+/g, " ");
    if (name.length < 2) return { ok: false, error: "اسم المشروع مطلوب (حرفان على الأقل)" };
    data.name = name;
  }
  if (input.aliases !== undefined) data.aliases = text(input.aliases, 300);
  if (input.active !== undefined) data.active = Boolean(input.active);
  if (input.location !== undefined) data.location = text(input.location, 200);
  if (input.priceText !== undefined) data.priceText = text(input.priceText, 200);
  if (input.details !== undefined) {
    if (typeof input.details === "string" && input.details.length > MAX_DETAILS) return { ok: false, error: `التفاصيل أطول من الحد (${MAX_DETAILS} حرف)` };
    data.details = text(input.details, MAX_DETAILS);
  }
  if (input.dailyVisitLimit !== undefined) {
    if (input.dailyVisitLimit === null || input.dailyVisitLimit === "") data.dailyVisitLimit = null;
    else {
      const limit = Number(input.dailyVisitLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) return { ok: false, error: "حد الزيارات اليومي للمشروع رقم من 1 إلى 500" };
      data.dailyVisitLimit = limit;
    }
  }
  return { ok: true, data };
}

export async function listProjects(tenantId: string): Promise<CrmProject[]> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT ${COLUMNS} FROM crm_projects WHERE tenant_id = $1 ORDER BY name ASC LIMIT ${MAX_PROJECTS}`, tenantId);
  return rows.map(toProject);
}

export async function getProject(tenantId: string, id: string): Promise<CrmProject | null> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT ${COLUMNS} FROM crm_projects WHERE tenant_id = $1 AND id = $2 LIMIT 1`, tenantId, id);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function createProject(tenantId: string, input: ProjectInput): Promise<{ ok: true; project: CrmProject } | { ok: false; error: string; code: number }> {
  const cleaned = cleanProjectInput(input, true);
  if (!cleaned.ok) return { ok: false, error: cleaned.error, code: 400 };
  const existing = await listProjects(tenantId);
  if (existing.length >= MAX_PROJECTS) return { ok: false, error: `أقصى عدد للمشاريع ${MAX_PROJECTS}`, code: 400 };
  if (existing.some((project) => project.name.toLowerCase() === cleaned.data.name!.toLowerCase())) return { ok: false, error: "يوجد مشروع بهذا الاسم", code: 409 };
  const id = `proj-${randomUUID()}`;
  const now = new Date().toISOString();
  const d = cleaned.data;
  await prisma.$executeRaw`INSERT INTO crm_projects (id, tenant_id, name, aliases, active, location, price_text, details, daily_visit_limit, created_at, updated_at)
    VALUES (${id}, ${tenantId}, ${d.name!}, ${d.aliases ?? ""}, ${d.active === false ? 0 : 1}, ${d.location ?? ""}, ${d.priceText ?? ""}, ${d.details ?? ""}, ${d.dailyVisitLimit ?? null}, ${now}, ${now})`;
  return { ok: true, project: (await getProject(tenantId, id))! };
}

export async function updateProject(tenantId: string, id: string, input: ProjectInput): Promise<{ ok: true; project: CrmProject } | { ok: false; error: string; code: number }> {
  const current = await getProject(tenantId, id);
  if (!current) return { ok: false, error: "المشروع غير موجود", code: 404 };
  const cleaned = cleanProjectInput(input, false);
  if (!cleaned.ok) return { ok: false, error: cleaned.error, code: 400 };
  const d = cleaned.data;
  if (d.name && d.name.toLowerCase() !== current.name.toLowerCase() && (await listProjects(tenantId)).some((project) => project.id !== id && project.name.toLowerCase() === d.name!.toLowerCase())) {
    return { ok: false, error: "يوجد مشروع بهذا الاسم", code: 409 };
  }
  const next = {
    name: d.name ?? current.name, aliases: d.aliases ?? current.aliases, active: d.active ?? current.active, location: d.location ?? current.location,
    priceText: d.priceText ?? current.priceText, details: d.details ?? current.details, dailyVisitLimit: d.dailyVisitLimit === undefined ? current.dailyVisitLimit : d.dailyVisitLimit
  };
  await prisma.$executeRaw`UPDATE crm_projects SET name = ${next.name}, aliases = ${next.aliases}, active = ${next.active ? 1 : 0}, location = ${next.location}, price_text = ${next.priceText}, details = ${next.details}, daily_visit_limit = ${next.dailyVisitLimit}, updated_at = ${new Date().toISOString()} WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return { ok: true, project: (await getProject(tenantId, id))! };
}

export async function deleteProject(tenantId: string, id: string): Promise<boolean> {
  await ensureTable();
  return Number(await prisma.$executeRaw`DELETE FROM crm_projects WHERE id = ${id} AND tenant_id = ${tenantId}`) === 1;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[ً-ٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
}

/**
 * The active project a piece of text is about: the project (or one of its other names) that the text mentions,
 * else the most similar name. Null when nothing clearly matches - the AI then asks which project is meant.
 */
export function matchProject(projects: CrmProject[], text: string): CrmProject | null {
  const haystack = normalize(text);
  if (!haystack) return null;
  let best: { project: CrmProject; score: number } | null = null;
  for (const project of projects) {
    if (!project.active) continue;
    const names = [project.name, ...project.aliases.split(/[,،\n]/)].map((name) => normalize(name)).filter((name) => name.length >= 2);
    let score = 0;
    for (const name of names) {
      if (haystack.includes(name)) score = Math.max(score, 1);
      else score = Math.max(score, textSimilarity(haystack, name) * 0.9);
    }
    if (score >= 0.55 && (!best || score > best.score)) best = { project, score };
  }
  return best?.project ?? null;
}

export async function findProjectForText(tenantId: string, text: string): Promise<CrmProject | null> {
  return matchProject(await listProjects(tenantId), text);
}

/** A project's profile as the facts the AI may use. */
export function projectProfileText(project: CrmProject): string {
  const lines = ["The lead's project:", `- Name: ${project.name}`];
  if (project.location) lines.push(`- Location: ${project.location}`);
  if (project.priceText) lines.push(`- Price: ${project.priceText}`);
  if (project.details) lines.push(`- Details:\n${project.details}`);
  return lines.join("\n");
}
