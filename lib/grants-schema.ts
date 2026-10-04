import { prisma } from "./prisma";

// Additive, idempotent DDL (same approach as lib/catalog-schema.ts).
export const GRANTS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenant_feature_grants (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    view_key TEXT NOT NULL,
    granted_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_feature_grants_tenant_id_view_key_key ON tenant_feature_grants(tenant_id, view_key)`
];

export async function ensureGrantsSchema() {
  for (const statement of GRANTS_SCHEMA_STATEMENTS) await prisma.$executeRawUnsafe(statement);
}
