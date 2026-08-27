-- Remove the Leads (CRM) feature entirely.
DROP TABLE IF EXISTS "leads";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "leads_enabled";
