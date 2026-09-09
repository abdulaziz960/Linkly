-- Sales Kanban pipeline stage + deal value, and marketing-click attribution
-- (page/link id, referrer, UTM) on conversations, plus the link_clicks
-- table recording each WhatsApp-CTA click before the customer even sends
-- a message.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'جديد';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deal_value DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_page_id TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_link_id TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_referrer TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_utm_source TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_utm_medium TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_utm_campaign TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_utm_content TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS link_clicks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  matched_conversation_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS link_clicks_created_at_idx ON link_clicks (created_at);
