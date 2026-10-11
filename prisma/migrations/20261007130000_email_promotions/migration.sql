CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "sender_name" TEXT NOT NULL,
  "sender_email" TEXT NOT NULL,
  "body_html" TEXT NOT NULL,
  "body_text" TEXT NOT NULL DEFAULT '',
  "cta_text" TEXT NOT NULL DEFAULT '',
  "cta_url" TEXT NOT NULL DEFAULT '',
  "audience_mode" TEXT NOT NULL DEFAULT 'all',
  "audience_json" TEXT NOT NULL DEFAULT '{}',
  "scheduled_at" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "total_recipients" INTEGER NOT NULL DEFAULT 0,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "delivered_count" INTEGER NOT NULL DEFAULT 0,
  "open_count" INTEGER NOT NULL DEFAULT 0,
  "click_count" INTEGER NOT NULL DEFAULT 0,
  "bounce_count" INTEGER NOT NULL DEFAULT 0,
  "unsubscribe_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_campaigns_tenant_id_status_idx" ON "email_campaigns"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "email_campaigns_tenant_id_scheduled_at_idx" ON "email_campaigns"("tenant_id", "scheduled_at");

CREATE TABLE IF NOT EXISTS "email_campaign_recipients" (
  "id" TEXT PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "provider_id" TEXT NOT NULL DEFAULT '',
  "error" TEXT NOT NULL DEFAULT '',
  "sent_at" TEXT NOT NULL DEFAULT '',
  "delivered_at" TEXT NOT NULL DEFAULT '',
  "opened_at" TEXT NOT NULL DEFAULT '',
  "clicked_at" TEXT NOT NULL DEFAULT '',
  "bounced_at" TEXT NOT NULL DEFAULT '',
  "unsubscribed_at" TEXT NOT NULL DEFAULT '',
  "open_count" INTEGER NOT NULL DEFAULT 0,
  "click_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_campaign_recipients_campaign_id_status_idx" ON "email_campaign_recipients"("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "email_campaign_recipients_tenant_id_email_idx" ON "email_campaign_recipients"("tenant_id", "email");

CREATE TABLE IF NOT EXISTS "email_marketing_opt_outs" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'unsubscribe',
  "created_at" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_marketing_opt_outs_tenant_id_email_key" ON "email_marketing_opt_outs"("tenant_id", "email");
CREATE INDEX IF NOT EXISTS "email_marketing_opt_outs_tenant_id_idx" ON "email_marketing_opt_outs"("tenant_id");

CREATE TABLE IF NOT EXISTS "email_campaign_balances" (
  "tenant_id" TEXT PRIMARY KEY,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TEXT NOT NULL
);
