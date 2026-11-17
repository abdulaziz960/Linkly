-- A price agreed with one client for one plan and billing cycle (0 = none). Reversible: see down.sql.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS custom_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS custom_price_cycle TEXT NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS custom_price_plan TEXT NOT NULL DEFAULT '';
