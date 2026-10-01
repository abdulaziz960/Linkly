ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS off_hours_auto_reply_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS off_hours_auto_reply_message TEXT NOT NULL DEFAULT '';
