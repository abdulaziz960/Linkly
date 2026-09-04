-- Records the size of a tenant's last campaign-balance top-up so low-balance
-- alerts (50%/20%/5% remaining) have a "100%" reference point to compare
-- against - the raw balance count alone has no notion of what "full" means.
ALTER TABLE campaign_balances ADD COLUMN IF NOT EXISTS last_top_up_amount INTEGER NOT NULL DEFAULT 0;
