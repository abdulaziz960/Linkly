// How far each encrypted conversation has been read, so a poll stores only what is new (and never brings back a
// conversation the workspace deleted). Raw-SQL lazy table, tagged templates (SQLite and Postgres).

import { prisma } from "../prisma";

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS x_chat_state (
      tenant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      last_event_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, conversation_id)
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Snowflake ids are too large for a JS number: compare as BigInt. */
export function isNewerId(candidate: string, watermark: string): boolean {
  if (!candidate) return false;
  if (!watermark) return true;
  try {
    return BigInt(candidate) > BigInt(watermark);
  } catch {
    return true;
  }
}

export async function getLastEventId(tenantId: string, conversationId: string): Promise<string> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ last_event_id: string }>>`SELECT last_event_id FROM x_chat_state WHERE tenant_id = ${tenantId} AND conversation_id = ${conversationId} LIMIT 1`;
  return rows[0]?.last_event_id ?? "";
}

export async function setLastEventId(tenantId: string, conversationId: string, eventId: string) {
  await ensureTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`DELETE FROM x_chat_state WHERE tenant_id = ${tenantId} AND conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO x_chat_state (tenant_id, conversation_id, last_event_id, updated_at) VALUES (${tenantId}, ${conversationId}, ${eventId}, ${now})`;
}
