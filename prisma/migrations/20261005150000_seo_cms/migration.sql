ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category_ar TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category_en TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS related_slugs TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS redirects (
  id TEXT PRIMARY KEY,
  from_path TEXT NOT NULL,
  to_url TEXT NOT NULL DEFAULT '',
  status_code INTEGER NOT NULL DEFAULT 301,
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS redirects_from_path_key ON redirects(from_path);

CREATE TABLE IF NOT EXISTS page_seo (
  path TEXT PRIMARY KEY,
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL DEFAULT '',
  noindex INTEGER NOT NULL DEFAULT 0,
  og_title TEXT NOT NULL DEFAULT '',
  og_description TEXT NOT NULL DEFAULT '',
  og_image TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_images (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data BYTEA NOT NULL,
  mime TEXT NOT NULL DEFAULT 'image/webp',
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_images_name_key ON cms_images(name);
