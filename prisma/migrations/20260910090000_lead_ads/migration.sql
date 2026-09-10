ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS lead_ads_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS lead_welcome_template_name TEXT NOT NULL DEFAULT '';
