-- Optional description and tags per campaign. Reversible: see down.sql.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';
