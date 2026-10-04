import { prisma } from "./prisma";

// Additive, idempotent DDL (same approach as lib/catalog-schema.ts).
export const BLOG_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    post_date TEXT NOT NULL,
    title_ar TEXT NOT NULL DEFAULT '',
    description_ar TEXT NOT NULL DEFAULT '',
    body_ar TEXT NOT NULL DEFAULT '',
    title_en TEXT NOT NULL DEFAULT '',
    description_en TEXT NOT NULL DEFAULT '',
    body_en TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_key ON blog_posts(slug)`,
  `CREATE INDEX IF NOT EXISTS blog_posts_published_post_date_idx ON blog_posts(published, post_date)`
];

export async function ensureBlogSchema() {
  for (const statement of BLOG_SCHEMA_STATEMENTS) await prisma.$executeRawUnsafe(statement);
}
