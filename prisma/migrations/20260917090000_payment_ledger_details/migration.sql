-- Payment ledger details. Records HOW each payment settled (gateway, the
-- gateway's own payment-attempt id, card scheme/wallet, raw gateway status,
-- decline reason), WHO initiated it, the metadata we sent (always stamped
-- with platform = Linkly), and - for subscriptions - the exact period the
-- payment bought. Only the two payment tables change; the `subscriptions`
-- table (read by every request) is not touched. Every column is additive
-- with a default, so existing rows and the running app keep working before
-- and after this is applied.
--
-- Fail fast instead of queueing behind a long-held lock (an open psql
-- session, a dump): while an ALTER waits for its lock, reads of that payment
-- table (billing page, invoices, admin payments) wait behind it. If this
-- times out, the migration is rolled back; retry with
-- `npm run db:resolve -- --rolled-back 20260917090000_payment_ledger_details`
-- followed by `npm run db:migrate:deploy`.
SET lock_timeout = '10s';

ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "gateway" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "gateway_payment_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "gateway_status" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "failure_reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "failed_at" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "initiated_by" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "metadata_json" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "period_start" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "period_end" TEXT NOT NULL DEFAULT '';

ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "gateway" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "gateway_payment_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "gateway_status" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "failure_reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "failed_at" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "initiated_by" TEXT NOT NULL DEFAULT '';
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "metadata_json" TEXT NOT NULL DEFAULT '';


-- Backfill the gateway for rows created before this column existed, using
-- the id conventions each write path already followed.
UPDATE "subscription_payments" SET "gateway" = 'stripe' WHERE "gateway" = '' AND "moyasar_id" LIKE 'stripe_test_%';
UPDATE "subscription_payments" SET "gateway" = 'test' WHERE "gateway" = '' AND "moyasar_id" LIKE 'test_%';
UPDATE "subscription_payments" SET "gateway" = 'moyasar' WHERE "gateway" = '' AND "moyasar_id" <> '';
UPDATE "campaign_payments" SET "gateway" = 'manual' WHERE "gateway" = '' AND "moyasar_id" = '' AND "id" LIKE 'pay-manual-%';
UPDATE "campaign_payments" SET "gateway" = 'moyasar' WHERE "gateway" = '' AND "moyasar_id" <> '';

-- Completed subscription payments predate period tracking; approximate the
-- period they covered as one month from completion so invoices stay coherent.
UPDATE "subscription_payments"
SET "period_start" = substr("completed_at", 1, 10),
    "period_end" = to_char((substr("completed_at", 1, 10)::date + INTERVAL '1 month'), 'YYYY-MM-DD')
WHERE "status" = 'مكتمل' AND "period_start" = '' AND "completed_at" <> '' AND substr("completed_at", 1, 10) ~ '^\d{4}-\d{2}-\d{2}$';
