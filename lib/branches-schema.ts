import { prisma } from "./prisma";

// Additive, idempotent DDL (same approach as lib/catalog-schema.ts).
export const BRANCHES_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    working_hours TEXT NOT NULL DEFAULT '',
    map_url TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS branches_tenant_id_active_idx ON branches(tenant_id, active)`
];

export async function ensureBranchesSchema() {
  for (const statement of BRANCHES_SCHEMA_STATEMENTS) await prisma.$executeRawUnsafe(statement);
}
