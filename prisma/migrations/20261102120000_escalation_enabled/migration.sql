-- Owner switch for auto-escalation of unanswered conversations (on by default). Reversible: see down.sql.
ALTER TABLE tenant_preferences ADD COLUMN IF NOT EXISTS escalation_enabled INTEGER NOT NULL DEFAULT 1;
