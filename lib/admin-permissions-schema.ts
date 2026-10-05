import { prisma } from "./prisma";

// Additive, idempotent DDL (same pattern as lib/branches-schema.ts and
// lib/client-notes-schema.ts): a NEW table, no ALTER on existing ones.
// A member with no row has full access, so nothing changes until an owner
// restricts someone. Failures are logged and never block the schema bootstrap.
export const ADMIN_PERMISSIONS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS platform_admin_permissions (
    user_id TEXT PRIMARY KEY,
    permissions TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  )`
];

export async function ensureAdminPermissionsSchema() {
  for (const statement of ADMIN_PERMISSIONS_SCHEMA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      console.error("[schema] platform_admin_permissions migration failed", error);
    }
  }
}
