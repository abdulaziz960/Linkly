-- Recurring campaigns: resend the same uploaded recipient list every N days.
-- The series definition (this table) keeps a frozen snapshot of the parsed
-- recipient list, since each firing spawns a brand-new campaigns row (a
-- campaign_recipients row is permanently tied to one campaign id) rather than
-- replaying the original one.
CREATE TABLE IF NOT EXISTS campaign_recurrences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  header_media_data_url TEXT NOT NULL DEFAULT '',
  recipients_json TEXT NOT NULL,
  interval_days INTEGER NOT NULL,
  next_run_at TEXT NOT NULL,
  end_at TEXT NOT NULL DEFAULT '',
  occurrences INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'نشطة',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recurrence_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS campaign_recurrences_tenant_id_status_idx ON campaign_recurrences(tenant_id, status);
CREATE INDEX IF NOT EXISTS campaign_recurrences_status_next_run_at_idx ON campaign_recurrences(status, next_run_at);
