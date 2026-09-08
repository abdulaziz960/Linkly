-- Bind anonymous CTA clicks to the workspace that owns the destination
-- WhatsApp number, and preserve attribution on contacts and conversations.
ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo';
ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS button_id TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attr_button_id TEXT NOT NULL DEFAULT '';

ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_page_id TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_link_id TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_button_id TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_referrer TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_utm_source TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_utm_medium TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_utm_campaign TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS attr_utm_content TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS link_clicks_created_at_idx;
CREATE INDEX IF NOT EXISTS link_clicks_tenant_id_created_at_idx ON link_clicks (tenant_id, created_at);
