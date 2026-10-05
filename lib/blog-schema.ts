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

// SEO fields added after the first release: added to an existing table only when missing.
export const BLOG_SEO_TEXT_COLUMNS = ["meta_title_ar", "meta_title_en", "meta_description_ar", "meta_description_en", "canonical_url", "og_title_ar", "og_title_en", "og_description_ar", "og_description_en", "og_image", "featured_image", "image_alt_ar", "image_alt_en"] as const;
export const BLOG_SEO_COLUMNS: Array<{ name: string; ddl: string }> = [
  ...BLOG_SEO_TEXT_COLUMNS.map((name) => ({ name, ddl: `${name} TEXT NOT NULL DEFAULT ''` })),
  { name: "noindex", ddl: "noindex INTEGER NOT NULL DEFAULT 0" }
];

export async function ensureBlogSchema() {
  for (const statement of BLOG_SCHEMA_STATEMENTS) await prisma.$executeRawUnsafe(statement);

  const isPostgres = process.env.DATABASE_URL?.startsWith("postgres");
  const present = new Set<string>(
    isPostgres
      ? (await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'blog_posts'`)).map((row) => row.column_name)
      : (await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(blog_posts)`)).map((row) => row.name)
  );
  for (const column of BLOG_SEO_COLUMNS) {
    if (!present.has(column.name)) await prisma.$executeRawUnsafe(`ALTER TABLE blog_posts ADD COLUMN ${column.ddl}`);
  }
}
