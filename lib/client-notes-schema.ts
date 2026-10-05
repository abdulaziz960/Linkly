import { prisma } from "./prisma";

// Additive, idempotent DDL (same approach as lib/branches-schema.ts). Internal
// admin notes are optional, so a failure here is logged and never blocks the
// rest of the schema bootstrap.
export const CLIENT_NOTES_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS client_notes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    author_id TEXT NOT NULL DEFAULT '',
    author_name TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS client_notes_tenant_created_idx ON client_notes(tenant_id, created_at)`
];

export async function ensureClientNotesSchema() {
  for (const statement of CLIENT_NOTES_SCHEMA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      console.error("[schema] client_notes migration failed", error);
    }
  }
}
