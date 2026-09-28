ALTER TABLE customers ADD COLUMN IF NOT EXISTS reengagement_sent_at TEXT NOT NULL DEFAULT '';
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS reengagement_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS reengagement_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS reengagement_template_name TEXT NOT NULL DEFAULT '';
