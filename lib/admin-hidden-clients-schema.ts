import { prisma } from "./prisma";

// Additive, idempotent DDL (same pattern as lib/admin-permissions-schema.ts):
// a NEW table, no ALTER on existing ones. A client with no row is visible.
// Failures are logged and never block the schema bootstrap.
export const ADMIN_HIDDEN_CLIENTS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS admin_hidden_clients (
    tenant_id TEXT PRIMARY KEY,
    hidden_at TEXT NOT NULL,
    hidden_by TEXT NOT NULL DEFAULT ''
  )`
];

export async function ensureAdminHiddenClientsSchema() {
  for (const statement of ADMIN_HIDDEN_CLIENTS_SCHEMA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      console.error("[schema] admin_hidden_clients migration failed", error);
    }
  }
}
