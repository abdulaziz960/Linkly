CREATE TABLE IF NOT EXISTS solution_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  title_ar TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  checklist_ar TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  checklist_en TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS solution_pages_slug_key ON solution_pages(slug);

CREATE INDEX IF NOT EXISTS solution_pages_published_sort_order_idx ON solution_pages(published, sort_order);
