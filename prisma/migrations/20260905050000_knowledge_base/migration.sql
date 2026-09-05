-- Knowledge base entries (FAQ Q&A or pasted-text) the bot's Knowledge Base
-- node matches an incoming customer message against.
CREATE TABLE IF NOT EXISTS knowledge_base_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_base_entries_tenant_id_idx ON knowledge_base_entries(tenant_id);
