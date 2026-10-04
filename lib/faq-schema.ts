import { prisma } from "./prisma";

// Additive, idempotent DDL (same approach as lib/catalog-schema.ts).
export const FAQ_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS faq_items (
    id TEXT PRIMARY KEY,
    question_ar TEXT NOT NULL DEFAULT '',
    answer_ar TEXT NOT NULL DEFAULT '',
    question_en TEXT NOT NULL DEFAULT '',
    answer_en TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS faq_items_active_sort_order_idx ON faq_items(active, sort_order)`
];

export async function ensureFaqSchema() {
  for (const statement of FAQ_SCHEMA_STATEMENTS) await prisma.$executeRawUnsafe(statement);
}
