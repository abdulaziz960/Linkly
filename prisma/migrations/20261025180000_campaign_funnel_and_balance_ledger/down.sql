-- Rolls back 20261025180000_campaign_funnel_and_balance_ledger (run by hand; Prisma has no automatic down).
DROP TABLE IF EXISTS campaign_balance_entries;
ALTER TABLE campaign_recipients DROP COLUMN IF EXISTS delivered_at;
ALTER TABLE campaign_recipients DROP COLUMN IF EXISTS replied_at;
