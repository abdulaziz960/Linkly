CREATE TABLE IF NOT EXISTS legal_pages (
  id TEXT PRIMARY KEY,
  title_ar TEXT NOT NULL DEFAULT '',
  updated_ar TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  updated_en TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
