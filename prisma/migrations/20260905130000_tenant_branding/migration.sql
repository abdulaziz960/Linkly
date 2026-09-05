-- Per-tenant white-label branding (name/logo/color) - empty means "use
-- Linkly's own default branding".
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS brand_name TEXT NOT NULL DEFAULT '';
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS brand_logo_data_url TEXT NOT NULL DEFAULT '';
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS brand_color TEXT NOT NULL DEFAULT '';
