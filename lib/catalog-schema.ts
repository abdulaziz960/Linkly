import { prisma } from "./prisma";

// Same additive DDL for SQLite (dev/tests) and PostgreSQL (production) -
// CREATE TABLE/INDEX IF NOT EXISTS is idempotent on both, and runs on every
// ensureSchema() including production (same approach as lib/ai-schema.ts),
// so a freshly deployed client never queries a table that doesn't exist yet.
export const CATALOG_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    external_id TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'SAR',
    image_url TEXT NOT NULL DEFAULT '',
    product_url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    sku TEXT NOT NULL DEFAULT '',
    stock INTEGER NOT NULL DEFAULT -1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS products_tenant_id_active_idx ON products(tenant_id, active)`,
  `CREATE INDEX IF NOT EXISTS products_tenant_id_external_id_idx ON products(tenant_id, external_id)`,
  `CREATE TABLE IF NOT EXISTS catalog_settings (
    tenant_id TEXT PRIMARY KEY,
    payment_enabled INTEGER NOT NULL DEFAULT 0,
    gateway_provider TEXT NOT NULL DEFAULT 'moyasar',
    gateway_secret_key TEXT NOT NULL DEFAULT '',
    feed_url TEXT NOT NULL DEFAULT '',
    feed_interval_minutes INTEGER NOT NULL DEFAULT 360,
    feed_last_synced_at TEXT NOT NULL DEFAULT '',
    feed_last_status TEXT NOT NULL DEFAULT '',
    feed_last_message TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit_price DOUBLE PRECISION NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total DOUBLE PRECISION NOT NULL,
    currency TEXT NOT NULL DEFAULT 'SAR',
    status TEXT NOT NULL DEFAULT 'new',
    payment_id TEXT NOT NULL DEFAULT '',
    payment_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS catalog_orders_tenant_id_created_at_idx ON catalog_orders(tenant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS catalog_orders_payment_id_idx ON catalog_orders(payment_id)`
];

export async function ensureCatalogSchema() {
  for (const statement of CATALOG_SCHEMA_STATEMENTS) await prisma.$executeRawUnsafe(statement);
}
