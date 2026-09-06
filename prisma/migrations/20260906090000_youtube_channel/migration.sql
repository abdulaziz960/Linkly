-- Adds the YouTube channel: reading and replying to comments on the
-- tenant's videos (YouTube has no DM API, only comments - same shape as
-- the existing Instagram-comments feature).
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS youtube_channel_title TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS youtube_refresh_token TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS youtube_token_expires_at TEXT NOT NULL DEFAULT '';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS youtube_comments_synced_at TEXT NOT NULL DEFAULT '';
