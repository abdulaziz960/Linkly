import { prisma } from "./prisma";

// The menus (list steps) a customer has been shown in a conversation, oldest first - what lets "رجوع" and
// "القائمة الرئيسية" know where to go. Raw SQL so it needs no Prisma schema change (works on SQLite and Postgres).
let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe("CREATE TABLE IF NOT EXISTS bot_menu_trail (conversation_id TEXT PRIMARY KEY, trail_json TEXT NOT NULL DEFAULT '[]')")
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

const MAX_TRAIL = 30;

export async function getMenuTrail(conversationId: string): Promise<string[]> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ trail_json: string }>>`SELECT trail_json FROM bot_menu_trail WHERE conversation_id = ${conversationId}`;
  try {
    const parsed = JSON.parse(rows[0]?.trail_json ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function setMenuTrail(conversationId: string, trail: string[]) {
  await ensureTable();
  const json = JSON.stringify(trail.slice(-MAX_TRAIL));
  await prisma.$executeRaw`DELETE FROM bot_menu_trail WHERE conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO bot_menu_trail (conversation_id, trail_json) VALUES (${conversationId}, ${json})`;
}

export async function pushMenu(conversationId: string, nodeId: string) {
  const trail = await getMenuTrail(conversationId);
  if (trail[trail.length - 1] !== nodeId) await setMenuTrail(conversationId, [...trail, nodeId]);
}
