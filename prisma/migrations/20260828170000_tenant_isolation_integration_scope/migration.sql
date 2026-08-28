-- Make tenant ownership explicit. The historical schema used tenant-demo as a
-- database default; production code must now provide tenant_id intentionally.
ALTER TABLE "customers" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "conversations" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "employees" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "teams" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "tags" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "templates" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "quick_replies" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "automation_rules" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "automation_queue" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "campaigns" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "campaign_recipients" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "work_schedules" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "user_accounts" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- Integration rows used to encode tenant ownership in ids such as
-- tenant-a:meta-whatsapp and email:tenant-a. Backfill explicit tenant columns
-- first, then use them for authorization/scoping.
ALTER TABLE "integration_settings" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo';
UPDATE "integration_settings"
SET "tenant_id" = split_part("id", ':', 1)
WHERE position(':' in "id") > 0;
ALTER TABLE "integration_settings" ALTER COLUMN "tenant_id" DROP DEFAULT;

ALTER TABLE "email_integrations" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo';
UPDATE "email_integrations"
SET "tenant_id" = substring("id" from 7)
WHERE "id" LIKE 'email:%' AND length("id") > 6;
ALTER TABLE "email_integrations" ALTER COLUMN "tenant_id" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "quick_replies_tenant_id_idx" ON "quick_replies"("tenant_id");
CREATE INDEX IF NOT EXISTS "work_schedules_tenant_id_idx" ON "work_schedules"("tenant_id");
CREATE INDEX IF NOT EXISTS "integration_settings_tenant_id_idx" ON "integration_settings"("tenant_id");
CREATE INDEX IF NOT EXISTS "integration_settings_tenant_id_provider_idx" ON "integration_settings"("tenant_id", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "integration_settings_tenant_id_provider_key" ON "integration_settings"("tenant_id", "provider");
CREATE INDEX IF NOT EXISTS "email_integrations_tenant_id_idx" ON "email_integrations"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "email_integrations_tenant_id_key" ON "email_integrations"("tenant_id");
