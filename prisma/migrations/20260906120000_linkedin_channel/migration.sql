-- Adds the LinkedIn channel: reading and replying to comments on the
-- tenant's Company Page posts (LinkedIn has no third-party DM API at all -
-- only comments, via the gated Community Management API - same shape as
-- the existing YouTube-comments feature).
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS linkedin_org_id TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS linkedin_org_name TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS linkedin_refresh_token TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS linkedin_token_expires_at TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS linkedin_comments_synced_at TEXT NOT NULL DEFAULT '';
