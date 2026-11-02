-- Splits message credit into the plan's allowance (replaced at each renewal) and the bought part (kept). -1 = not split yet. Reversible: see down.sql.
ALTER TABLE campaign_balances ADD COLUMN IF NOT EXISTS purchased_balance INTEGER NOT NULL DEFAULT -1;
ALTER TABLE email_campaign_balances ADD COLUMN IF NOT EXISTS purchased_balance INTEGER NOT NULL DEFAULT -1;
