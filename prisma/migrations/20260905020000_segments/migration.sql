-- Segments: a saved tag(s) + inactivity-days filter that resolves against
-- live customer/conversation/tag data, used directly as a campaign's
-- audience alongside the existing file-upload path. Only the filter
-- criteria are stored - recipients are resolved fresh every time the
-- segment is used.
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tag_names TEXT NOT NULL DEFAULT '',
  inactive_days INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS segments_tenant_id_idx ON segments(tenant_id);
