ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS locked_at TEXT NOT NULL DEFAULT '';
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS two_factor_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS two_factor_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS two_factor_codes_user_id_idx ON two_factor_codes(user_id);
