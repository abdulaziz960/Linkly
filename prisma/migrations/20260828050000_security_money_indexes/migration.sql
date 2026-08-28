-- Store exact payment amounts in halalas while keeping the legacy SAR float
-- columns for backward-compatible reads during the transition.
ALTER TABLE "campaign_payments" ADD COLUMN IF NOT EXISTS "amount_halalas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "amount_halalas" INTEGER NOT NULL DEFAULT 0;

UPDATE "campaign_payments"
SET "amount_halalas" = CAST(ROUND("amount" * 100) AS INTEGER)
WHERE "amount_halalas" = 0 AND "amount" IS NOT NULL;

UPDATE "subscription_payments"
SET "amount_halalas" = CAST(ROUND("amount" * 100) AS INTEGER)
WHERE "amount_halalas" = 0 AND "amount" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "customers_tenant_id_idx" ON "customers"("tenant_id");
CREATE INDEX IF NOT EXISTS "customers_tenant_id_phone_idx" ON "customers"("tenant_id", "phone");
CREATE INDEX IF NOT EXISTS "conversations_tenant_id_status_idx" ON "conversations"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "conversations_tenant_id_channel_idx" ON "conversations"("tenant_id", "channel");
CREATE INDEX IF NOT EXISTS "conversations_tenant_id_last_activity_at_idx" ON "conversations"("tenant_id", "last_activity_at");
CREATE INDEX IF NOT EXISTS "conversations_customer_id_idx" ON "conversations"("customer_id");
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "messages_source_type_source_id_idx" ON "messages"("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "employees_tenant_id_idx" ON "employees"("tenant_id");
CREATE INDEX IF NOT EXISTS "employees_tenant_id_email_idx" ON "employees"("tenant_id", "email");
CREATE INDEX IF NOT EXISTS "teams_tenant_id_idx" ON "teams"("tenant_id");
CREATE INDEX IF NOT EXISTS "tags_tenant_id_idx" ON "tags"("tenant_id");
CREATE INDEX IF NOT EXISTS "automation_rules_tenant_id_enabled_idx" ON "automation_rules"("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "automation_queue_tenant_id_run_at_idx" ON "automation_queue"("tenant_id", "run_at");
CREATE INDEX IF NOT EXISTS "automation_queue_rule_id_idx" ON "automation_queue"("rule_id");
CREATE INDEX IF NOT EXISTS "automation_queue_conversation_id_idx" ON "automation_queue"("conversation_id");
CREATE INDEX IF NOT EXISTS "campaigns_tenant_id_status_idx" ON "campaigns"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "campaigns_tenant_id_scheduled_at_idx" ON "campaigns"("tenant_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "campaign_recipients_tenant_id_status_idx" ON "campaign_recipients"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "campaign_payments_tenant_id_status_idx" ON "campaign_payments"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "campaign_payments_moyasar_id_idx" ON "campaign_payments"("moyasar_id");
CREATE INDEX IF NOT EXISTS "integration_settings_provider_waba_id_idx" ON "integration_settings"("provider", "waba_id");
CREATE INDEX IF NOT EXISTS "integration_settings_provider_phone_number_id_idx" ON "integration_settings"("provider", "phone_number_id");
CREATE INDEX IF NOT EXISTS "user_accounts_tenant_id_idx" ON "user_accounts"("tenant_id");
CREATE INDEX IF NOT EXISTS "user_accounts_is_platform_admin_idx" ON "user_accounts"("is_platform_admin");
CREATE INDEX IF NOT EXISTS "subscription_payments_tenant_id_status_idx" ON "subscription_payments"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "subscription_payments_moyasar_id_idx" ON "subscription_payments"("moyasar_id");
CREATE INDEX IF NOT EXISTS "bot_settings_tenant_id_channel_idx" ON "bot_settings"("tenant_id", "channel");
CREATE INDEX IF NOT EXISTS "bot_nodes_tenant_id_channel_idx" ON "bot_nodes"("tenant_id", "channel");
