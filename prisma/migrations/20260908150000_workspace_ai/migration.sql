CREATE TABLE IF NOT EXISTS ai_workspace_settings (
  tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  prompt TEXT NOT NULL DEFAULT '',
  daily_limit INTEGER NOT NULL DEFAULT 100,
  monthly_limit INTEGER NOT NULL DEFAULT 1000,
  input_rate DOUBLE PRECISION,
  output_rate DOUBLE PRECISION,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage_buckets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ai_usage_buckets_tenant_id_period_idx ON ai_usage_buckets(tenant_id, period);
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost DOUBLE PRECISION,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_id_created_at_idx ON ai_usage_events(tenant_id, created_at);
