ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "auto_renew_enabled" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "saved_card_token" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "saved_card_last4" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "saved_card_brand" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "auto_renew_fail_count" INTEGER NOT NULL DEFAULT 0;
