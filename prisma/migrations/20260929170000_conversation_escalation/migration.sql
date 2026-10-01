ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escalated_for_message_id TEXT NOT NULL DEFAULT '';
