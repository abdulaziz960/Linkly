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
  // How long an order takes to prepare: the merchant's usual time (told to the customer when the order is paid) and the time set for one order.
  `CREATE TABLE IF NOT EXISTS catalog_prep_settings (
    tenant_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    default_minutes INTEGER NOT NULL DEFAULT 30,
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_order_prep (
    order_id TEXT PRIMARY KEY,
    minutes INTEGER NOT NULL,
    set_at TEXT NOT NULL
  )`,
  // Pickup instead of delivery: what the merchant offers (in store, from the car), the customer's pending choice in the chat and the choice stored with a placed order.
  `CREATE TABLE IF NOT EXISTS catalog_pickup_settings (
    tenant_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    in_store INTEGER NOT NULL DEFAULT 1,
    curbside INTEGER NOT NULL DEFAULT 1,
    ask_car_details INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_pickup_choice (
    conversation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    plate TEXT NOT NULL DEFAULT '',
    car_details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_order_pickup (
    order_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    plate TEXT NOT NULL DEFAULT '',
    car_details TEXT NOT NULL DEFAULT ''
  )`,
  // Choices a customer makes on a product before it goes into the cart (size, extras...): groups of options, some with an extra price.
  // product_id '' = the group applies to every product.
  `CREATE TABLE IF NOT EXISTS catalog_option_groups (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    multiple INTEGER NOT NULL DEFAULT 0,
    max_choices INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS catalog_option_groups_tenant_idx ON catalog_option_groups(tenant_id, product_id)`,
  `CREATE TABLE IF NOT EXISTS catalog_options (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS catalog_options_group_idx ON catalog_options(group_id)`,
  // Demo workspaces (the reviewer link): one row per temporary workspace, deleted after expires_at.
  `CREATE TABLE IF NOT EXISTS demo_workspaces (
    tenant_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  // The fake Salla store of a demo workspace.
  `CREATE TABLE IF NOT EXISTS demo_salla_orders (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    reference TEXT NOT NULL,
    status_slug TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    total REAL NOT NULL,
    items_json TEXT NOT NULL,
    address_json TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    tracking_number TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  // Branches: each keeps its own stock per product; the customer picks one at checkout and the order is taken from it.
  `CREATE TABLE IF NOT EXISTS catalog_branches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_branch_stock (
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    stock INTEGER NOT NULL,
    PRIMARY KEY (branch_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_branch_choice (
    conversation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  // A branch's map link (shown to the customer once the order is placed); apart from catalog_branches so that table never needs an ALTER.
  `CREATE TABLE IF NOT EXISTS catalog_branch_links (
    branch_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    map_url TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_order_branch (
    order_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    branch_name TEXT NOT NULL
  )`,
  // The categories a merchant registers; a product picks one from this list.
  `CREATE TABLE IF NOT EXISTS catalog_categories (
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, name)
  )`,
  // A product photo the merchant uploaded (a JPEG data URL, already resized by the dashboard); served publicly so WhatsApp can fetch it.
  `CREATE TABLE IF NOT EXISTS catalog_product_images (
    product_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    data_url TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // The picture of the whole menu (a restaurant's printed menu): sent to the customer when they open the catalog.
  `CREATE TABLE IF NOT EXISTS catalog_menu_images (
    tenant_id TEXT PRIMARY KEY,
    data_url TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // The kind of business the merchant says they run (restaurant, cafe, shop, offline); it switches on the menu picture.
  `CREATE TABLE IF NOT EXISTS catalog_business_type (
    tenant_id TEXT PRIMARY KEY,
    business TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // How an order was paid (mada, card, Apple Pay, Tabby...), read from the provider when the payment is confirmed.
  `CREATE TABLE IF NOT EXISTS catalog_order_payment_method (
    order_id TEXT PRIMARY KEY,
    method TEXT NOT NULL
  )`,
  // The cashier's shifts: opened with the cash in the drawer, closed with the cash counted.
  `CREATE TABLE IF NOT EXISTS catalog_shifts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    opened_by TEXT NOT NULL,
    opening_cash DOUBLE PRECISION NOT NULL,
    closed_at TEXT NOT NULL DEFAULT '',
    closed_by TEXT NOT NULL DEFAULT '',
    counted_cash DOUBLE PRECISION NOT NULL DEFAULT 0,
    expected_cash DOUBLE PRECISION NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT ''
  )`,
  // Whether the end-of-day summary is sent to the owner (on unless switched off).
  `CREATE TABLE IF NOT EXISTS catalog_daily_summary_settings (
    tenant_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // The English name of a product (shown when the dashboard is in English); the product itself keeps one name.
  `CREATE TABLE IF NOT EXISTS catalog_product_names_en (
    product_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name_en TEXT NOT NULL DEFAULT ''
  )`,
  // Optional English names of option groups and options (shown when the dashboard is in English); keyed by the group or option id.
  `CREATE TABLE IF NOT EXISTS catalog_option_names_en (
    ref_id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL DEFAULT ''
  )`,
  // The options chosen on an order's line (as names at the time of the order), kept apart from the product name.
  `CREATE TABLE IF NOT EXISTS catalog_order_item_options (
    order_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    options_json TEXT NOT NULL,
    PRIMARY KEY (order_id, line_no)
  )`,
  // Where a customer is in a product's choices (which group, what they picked so far); group_index = -1 means all answered, waiting for the quantity.
  `CREATE TABLE IF NOT EXISTS catalog_option_flow (
    conversation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'cart',
    group_index INTEGER NOT NULL DEFAULT 0,
    chosen_json TEXT NOT NULL DEFAULT '[]',
    expires_at TEXT NOT NULL
  )`,
  // Loyalty for orders placed and paid in WhatsApp: the program, each customer's progress, the orders already counted and the rewards given.
  `CREATE TABLE IF NOT EXISTS loyalty_settings (
    tenant_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    goal INTEGER NOT NULL DEFAULT 4,
    reward_kind TEXT NOT NULL DEFAULT 'percent',
    reward_value DOUBLE PRECISION NOT NULL DEFAULT 20,
    product_id TEXT NOT NULL DEFAULT '',
    valid_days INTEGER NOT NULL DEFAULT 30,
    notify_progress INTEGER NOT NULL DEFAULT 1,
    progress_text TEXT NOT NULL DEFAULT '',
    reward_text TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS loyalty_progress (
    tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    orders_in_cycle INTEGER NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    rewards_given INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (tenant_id, phone)
  )`,
  `CREATE TABLE IF NOT EXISTS loyalty_counted_orders (
    order_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    counted_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT '',
    order_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS loyalty_rewards_tenant_idx ON loyalty_rewards(tenant_id, created_at)`,
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
