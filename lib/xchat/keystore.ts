// The private X Chat keys of each workspace's X account, kept encrypted at rest (AES-256-GCM, the same envelope as
// every other secret). Whoever holds these can read that account's encrypted messages, so they are never returned
// to the browser, never logged, and only ever decrypted in memory to build an engine (lib/xchat/engine.ts).
// Raw-SQL lazy table, tagged templates so it runs on both SQLite and Postgres.

import { prisma } from "../prisma";
import { decryptSecret, encryptSecret } from "../secret-storage";

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS x_chat_keys (
      tenant_id TEXT PRIMARY KEY,
      x_user_id TEXT NOT NULL,
      key_version TEXT NOT NULL,
      keys_enc TEXT NOT NULL,
      registered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export type XChatKeyRecord = { tenantId: string; xUserId: string; keyVersion: string; privateKeys: Uint8Array; registered: boolean };

type Row = { tenant_id: string; x_user_id: string; key_version: string; keys_enc: string; registered: number | bigint };

export async function saveXChatKeys(input: { tenantId: string; xUserId: string; keyVersion: string; privateKeys: Uint8Array; registered: boolean }) {
  await ensureTable();
  const now = new Date().toISOString();
  const enc = encryptSecret(Buffer.from(input.privateKeys).toString("base64"));
  const registered = input.registered ? 1 : 0;
  await prisma.$executeRaw`DELETE FROM x_chat_keys WHERE tenant_id = ${input.tenantId}`;
  await prisma.$executeRaw`INSERT INTO x_chat_keys (tenant_id, x_user_id, key_version, keys_enc, registered, created_at, updated_at) VALUES (${input.tenantId}, ${input.xUserId}, ${input.keyVersion}, ${enc}, ${registered}, ${now}, ${now})`;
}

export async function markXChatKeysRegistered(tenantId: string) {
  await ensureTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`UPDATE x_chat_keys SET registered = 1, updated_at = ${now} WHERE tenant_id = ${tenantId}`;
}

export async function getXChatKeys(tenantId: string): Promise<XChatKeyRecord | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT tenant_id, x_user_id, key_version, keys_enc, registered FROM x_chat_keys WHERE tenant_id = ${tenantId} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    xUserId: row.x_user_id,
    keyVersion: row.key_version,
    privateKeys: new Uint8Array(Buffer.from(decryptSecret(row.keys_enc), "base64")),
    registered: Number(row.registered) === 1
  };
}

/** Whether keys exist and are registered with X - the only thing the dashboard may know about them. */
export async function getXChatKeyStatus(tenantId: string): Promise<{ hasKeys: boolean; registered: boolean; keyVersion: string }> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<Pick<Row, "key_version" | "registered">>>`SELECT key_version, registered FROM x_chat_keys WHERE tenant_id = ${tenantId} LIMIT 1`;
  const row = rows[0];
  return { hasKeys: Boolean(row), registered: Number(row?.registered ?? 0) === 1, keyVersion: row?.key_version ?? "" };
}

export async function deleteXChatKeys(tenantId: string) {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM x_chat_keys WHERE tenant_id = ${tenantId}`;
}
