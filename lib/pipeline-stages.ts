import { randomUUID } from "crypto";
import { prisma } from "./prisma";

/**
 * Sales-pipeline stages.
 *
 * Every workspace has the seven built-in stages. It can add its own (e.g. "حضر الاجتماع");
 * a custom stage is a first-class stage everywhere: the leads board, the conversation
 * panel, the filters and the ad-platform mappings (Meta, TikTok, Snapchat) - which is the
 * point of it: a client can send its own milestone to the ad platforms as an event.
 *
 * Custom stages sit before the two closing stages ("فاز", "خسر") so the funnel still ends
 * in won / lost. They have no deal value (only the built-in quote/booking/closing stages do).
 */

export const BUILT_IN_STAGES = ["جديد", "مهتم", "مؤهل", "عرض سعر", "تم الحجز", "فاز", "خسر"] as const;
const CLOSING_STAGES: readonly string[] = ["فاز", "خسر"];
/** Names a person already sees for the built-in "فاز"/"خسر" stages. */
const RESERVED_LABELS = ["تم البيع", "غير مهتم"];

export const MAX_CUSTOM_STAGES = 8;
const STAGE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,28}[\p{L}\p{N}]$/u;

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pipeline_custom_stages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS pipeline_custom_stages_tenant_name ON pipeline_custom_stages (tenant_id, name)`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function getCustomStages(tenantId: string): Promise<string[]> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM pipeline_custom_stages WHERE tenant_id = ${tenantId} ORDER BY position ASC, created_at ASC`;
  return rows.map((row) => row.name);
}

/** Built-in stages with the workspace's custom ones inserted before the closing stages. */
export function composeStages(custom: readonly string[]): string[] {
  const open = BUILT_IN_STAGES.filter((stage) => !CLOSING_STAGES.includes(stage));
  const closing = BUILT_IN_STAGES.filter((stage) => CLOSING_STAGES.includes(stage));
  return [...open, ...custom, ...closing];
}

export async function getTenantStages(tenantId: string): Promise<string[]> {
  return composeStages(await getCustomStages(tenantId));
}

export async function isTenantStage(tenantId: string, stage: unknown): Promise<boolean> {
  if (typeof stage !== "string" || !stage) return false;
  if ((BUILT_IN_STAGES as readonly string[]).includes(stage)) return true;
  return (await getCustomStages(tenantId)).includes(stage);
}

export function cleanStageName(input: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (!STAGE_NAME.test(name)) return { ok: false, error: "اسم المرحلة من 3 إلى 30 حرفًا (حروف وأرقام ومسافات فقط)" };
  if ((BUILT_IN_STAGES as readonly string[]).includes(name) || RESERVED_LABELS.includes(name)) return { ok: false, error: "هذا الاسم مستخدم لمرحلة أساسية" };
  return { ok: true, name };
}

export async function addCustomStage(tenantId: string, input: unknown): Promise<{ ok: true; stages: string[] } | { ok: false; error: string; code: number }> {
  const cleaned = cleanStageName(input);
  if (!cleaned.ok) return { ok: false, error: cleaned.error, code: 400 };
  const existing = await getCustomStages(tenantId);
  if (existing.some((stage) => stage.toLowerCase() === cleaned.name.toLowerCase())) return { ok: false, error: "المرحلة موجودة مسبقًا", code: 409 };
  if (existing.length >= MAX_CUSTOM_STAGES) return { ok: false, error: `أقصى عدد للمراحل المخصصة ${MAX_CUSTOM_STAGES}`, code: 400 };
  await prisma.$executeRaw`INSERT INTO pipeline_custom_stages (id, tenant_id, name, position, created_at) VALUES (${randomUUID()}, ${tenantId}, ${cleaned.name}, ${existing.length}, ${new Date().toISOString()})`;
  return { ok: true, stages: await getTenantStages(tenantId) };
}

/** Removes a custom stage; its conversations go back to the first stage ("جديد"). */
export async function removeCustomStage(tenantId: string, name: unknown): Promise<{ ok: true; moved: number; stages: string[] } | { ok: false; error: string; code: number }> {
  const stage = typeof name === "string" ? name.trim() : "";
  if (!(await getCustomStages(tenantId)).includes(stage)) return { ok: false, error: "المرحلة غير موجودة أو أساسية ولا يمكن حذفها", code: 404 };
  const moved = await prisma.conversation.updateMany({ where: { tenantId, pipelineStage: stage }, data: { pipelineStage: BUILT_IN_STAGES[0] } });
  await prisma.$executeRaw`DELETE FROM pipeline_custom_stages WHERE tenant_id = ${tenantId} AND name = ${stage}`;
  return { ok: true, moved: moved.count, stages: await getTenantStages(tenantId) };
}
