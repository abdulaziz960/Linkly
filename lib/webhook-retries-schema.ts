import { prisma } from "./prisma";

// Additive, idempotent DDL (same pattern as lib/admin-hidden-clients-schema.ts):
// a NEW table, no ALTER on existing ones. Failures are logged and never block
// the schema bootstrap.
export const WEBHOOK_RETRIES_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS webhook_retries (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    event TEXT NOT NULL,
    body TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    next_attempt_at TEXT NOT NULL,
    last_status INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS webhook_retries_status_next_attempt_at_idx ON webhook_retries(status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS webhook_retries_webhook_id_idx ON webhook_retries(webhook_id)`
];

export async function ensureWebhookRetriesSchema() {
  for (const statement of WEBHOOK_RETRIES_SCHEMA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      console.error("[schema] webhook_retries migration failed", error);
    }
  }
}
