-- Adds the "Development" (التطوير) module: tenants suggest new features/ideas,
-- and the platform admin tracks each suggestion as pending / in_progress /
-- resolved / rejected (with a reason). Unrelated to support tickets.
CREATE TABLE IF NOT EXISTS feature_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS feature_requests_tenant_id_status_idx ON feature_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS feature_requests_status_idx ON feature_requests(status);
