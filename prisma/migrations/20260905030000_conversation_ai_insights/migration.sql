-- AI conversation summarization/classification infrastructure. The actual
-- AI provider call is a pluggable stub until one is wired in - this
-- migration just adds the storage/queue it will write to.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS closed_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS conversation_insights (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT '',
  satisfaction_level TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_insights_tenant_id_created_at_idx ON conversation_insights(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS conversation_summary_queue (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_summary_queue_tenant_id_idx ON conversation_summary_queue(tenant_id);
