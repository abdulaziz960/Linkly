import { prisma } from "./prisma";
import { DEFAULT_AI_TONE, isAiTone, type AiTone } from "./ai-tone-options";

// One row per workspace in a table created on first use (no Prisma schema change, works on SQLite and Postgres).
let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe("CREATE TABLE IF NOT EXISTS ai_reply_tone (tenant_id TEXT PRIMARY KEY, tone TEXT NOT NULL, updated_at TEXT NOT NULL)")
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

/** The tone the workspace chose for its assistant's replies to customers (the Saudi colloquial voice until it does). */
export async function getAiTone(tenantId: string): Promise<AiTone> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ tone: string }>>`SELECT tone FROM ai_reply_tone WHERE tenant_id = ${tenantId} LIMIT 1`;
    return isAiTone(rows[0]?.tone) ? rows[0].tone : DEFAULT_AI_TONE;
  } catch {
    return DEFAULT_AI_TONE;
  }
}

export async function saveAiTone(tenantId: string, tone: AiTone): Promise<void> {
  await ensureTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`DELETE FROM ai_reply_tone WHERE tenant_id = ${tenantId}`;
  await prisma.$executeRaw`INSERT INTO ai_reply_tone (tenant_id, tone, updated_at) VALUES (${tenantId}, ${tone}, ${now})`;
}
