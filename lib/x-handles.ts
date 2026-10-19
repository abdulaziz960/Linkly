// The @handle of each X customer, kept beside the inbox so the conversation can show it under the person's display
// name (the customer row carries the display name and the numeric X id). Raw-SQL lazy table, tagged templates
// (SQLite and Postgres).

import { prisma } from "./prisma";

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS x_handles (
      tenant_id TEXT NOT NULL,
      x_user_id TEXT NOT NULL,
      handle TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, x_user_id)
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

type XUserLike = { name?: string; username?: string } | undefined | null;

/** The customer's display name (their profile name; the @handle only when there is no name) and their @handle. */
export function xCustomerLabel(user: XUserLike): { name?: string; handle?: string } {
  const handle = user?.username ? `@${user.username.replace(/^@/, "")}` : undefined;
  return { name: user?.name?.trim() || handle, handle };
}

export async function saveXHandle(tenantId: string, xUserId: string, handle: string) {
  const clean = handle.trim();
  if (!clean || !xUserId) return;
  await ensureTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`DELETE FROM x_handles WHERE tenant_id = ${tenantId} AND x_user_id = ${xUserId}`;
  await prisma.$executeRaw`INSERT INTO x_handles (tenant_id, x_user_id, handle, updated_at) VALUES (${tenantId}, ${xUserId}, ${clean}, ${now})`;
}

/** x_user_id -> @handle for a workspace. Empty when none saved yet (or the table cannot be read). */
export async function getXHandles(tenantId: string): Promise<Map<string, string>> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ x_user_id: string; handle: string }>>`SELECT x_user_id, handle FROM x_handles WHERE tenant_id = ${tenantId}`;
    return new Map(rows.map((row) => [row.x_user_id, row.handle]));
  } catch {
    return new Map();
  }
}
