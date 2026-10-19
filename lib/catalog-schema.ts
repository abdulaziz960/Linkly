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
  `CREATE INDEX IF NOT EXISTS catalog_orders_payment_id_idx ON catalog_orders(payment_id)`,
  // The lines of an order placed from the chat cart (an order bought straight from one product has none: its own row is the line).
  `CREATE TABLE IF NOT EXISTS catalog_order_items (
    order_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit_price DOUBLE PRECISION NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (order_id, line_no)
  )`,
  // Discount codes a merchant creates (percent or fixed amount) for customers to apply in the chat cart.
  `CREATE TABLE IF NOT EXISTS catalog_discounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'percent',
    value DOUBLE PRECISION NOT NULL DEFAULT 0,
    min_order DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS catalog_discounts_tenant_code_idx ON catalog_discounts(tenant_id, code)`,
  // The code a customer applied to the cart in a conversation, and the code (and amount) an order was placed with.
  `CREATE TABLE IF NOT EXISTS catalog_cart_discounts (
    conversation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_order_discounts (
    order_id TEXT PRIMARY KEY,
    discount_id TEXT NOT NULL,
    code TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL
  )`,
  // Delivery options the merchant offers: a shipping company (or the merchant's own delivery), its price, an optional
  // free-shipping threshold, an estimate and the cities it serves ('[]' = every city).
  `CREATE TABLE IF NOT EXISTS catalog_shipping_methods (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    free_over DOUBLE PRECISION NOT NULL DEFAULT 0,
    eta TEXT NOT NULL DEFAULT '',
    cities_json TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS catalog_shipping_methods_tenant_idx ON catalog_shipping_methods(tenant_id)`,
  // Shipment tracking the staff enter by hand: the stage, the carrier, its tracking number and (optionally) a link.
  `CREATE TABLE IF NOT EXISTS catalog_order_tracking (
    order_id TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'preparing',
    carrier TEXT NOT NULL DEFAULT '',
    tracking_number TEXT NOT NULL DEFAULT '',
    tracking_url TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  // Where an order goes and what the delivery cost.
  `CREATE TABLE IF NOT EXISTS catalog_order_shipping (
    order_id TEXT PRIMARY KEY,
    method_name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    fee DOUBLE PRECISION NOT NULL DEFAULT 0,
    eta TEXT NOT NULL DEFAULT ''
  )`,
  // The questions of a checkout in progress (city, delivery option, address, payment method).
  `CREATE TABLE IF NOT EXISTS catalog_checkout_flow (
    conversation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    step TEXT NOT NULL,
    data_json TEXT NOT NULL DEFAULT '{}',
    expires_at TEXT NOT NULL
  )`,
  // Extra payment methods a merchant switches on (Tabby, Tamara): one row per method, its keys kept encrypted.
  `CREATE TABLE IF NOT EXISTS catalog_payment_providers (
    tenant_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_enc TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, provider)
  )`,
  // The cart a customer is filling in a conversation, plus the product whose quantity we are waiting for.
  `CREATE TABLE IF NOT EXISTS catalog_carts (
    conversation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    pending_product_id TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`
];

export async function ensureCatalogSchema() {
  for (const statement of CATALOG_SCHEMA_STATEMENTS) await prisma.$executeRawUnsafe(statement);
}
