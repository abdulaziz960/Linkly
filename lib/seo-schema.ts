import { prisma } from "./prisma";

// Additive, idempotent DDL (same approach as lib/blog-schema.ts).
// - redirects: managed 301/302/410 rules, applied by proxy.ts
// - page_seo: per-page SEO overrides for the fixed public pages (home, FAQ, contact...)
// - cms_images: images uploaded from the admin panel (stored as WebP in the database,
//   served from /media/<name>; Cloud Run has no persistent disk)
export function seoSchemaStatements(postgres: boolean) {
  return [
    `CREATE TABLE IF NOT EXISTS redirects (
      id TEXT PRIMARY KEY,
      from_path TEXT NOT NULL,
      to_url TEXT NOT NULL DEFAULT '',
      status_code INTEGER NOT NULL DEFAULT 301,
      enabled INTEGER NOT NULL DEFAULT 1,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS redirects_from_path_key ON redirects(from_path)`,
    `CREATE TABLE IF NOT EXISTS page_seo (
      path TEXT PRIMARY KEY,
      meta_title TEXT NOT NULL DEFAULT '',
      meta_description TEXT NOT NULL DEFAULT '',
      canonical_url TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      og_title TEXT NOT NULL DEFAULT '',
      og_description TEXT NOT NULL DEFAULT '',
      og_image TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cms_images (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data ${postgres ? "BYTEA" : "BLOB"} NOT NULL,
      mime TEXT NOT NULL DEFAULT 'image/webp',
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cms_images_name_key ON cms_images(name)`,
    `CREATE TABLE IF NOT EXISTS landing_content (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`
  ];
}

export async function ensureSeoSchema() {
  const postgres = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));
  for (const statement of seoSchemaStatements(postgres)) await prisma.$executeRawUnsafe(statement);
}
