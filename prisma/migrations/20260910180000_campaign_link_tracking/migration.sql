ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS link_tracking_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS destination_url TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS tracking_code TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS read_at TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS clicked_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS campaign_recipients_tracking_code_idx ON campaign_recipients(tracking_code);
