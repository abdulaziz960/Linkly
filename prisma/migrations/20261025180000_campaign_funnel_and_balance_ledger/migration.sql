-- Campaign funnel (delivered / replied) and the usage side of the campaign balance ledger.
-- Reversible: see down.sql in this folder.
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS delivered_at TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS replied_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS campaign_balance_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'usage',
  messages INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS campaign_balance_entries_tenant_id_created_at_idx ON campaign_balance_entries(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS campaign_balance_entries_campaign_id_idx ON campaign_balance_entries(campaign_id);

-- One ledger row for every campaign that already sent messages, so past usage shows in the ledger too.
INSERT INTO campaign_balance_entries (id, tenant_id, campaign_id, kind, messages, note, created_at, updated_at)
SELECT 'usage-' || c.id, c.tenant_id, c.id, 'usage', -c.sent, c.name, c.updated_at, c.updated_at
FROM campaigns c
WHERE c.sent > 0 AND NOT EXISTS (SELECT 1 FROM campaign_balance_entries e WHERE e.id = 'usage-' || c.id);
