ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'شهري';
