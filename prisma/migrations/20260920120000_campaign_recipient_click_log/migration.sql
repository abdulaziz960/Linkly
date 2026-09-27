CREATE TABLE IF NOT EXISTS campaign_recipient_clicks (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  clicked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS campaign_recipient_clicks_recipient_id_idx ON campaign_recipient_clicks(recipient_id);
CREATE INDEX IF NOT EXISTS campaign_recipient_clicks_tenant_id_idx ON campaign_recipient_clicks(tenant_id);
