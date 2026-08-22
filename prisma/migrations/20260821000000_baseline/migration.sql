-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "initial" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "last_message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "window_expired" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TEXT NOT NULL DEFAULT '',
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "bot_ran_at" TEXT NOT NULL DEFAULT '',
    "bot_waiting_node_title" TEXT NOT NULL DEFAULT '',
    "off_hours_notified_at" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "attachment_type" TEXT NOT NULL DEFAULT '',
    "attachment_url" TEXT NOT NULL DEFAULT '',
    "attachment_name" TEXT NOT NULL DEFAULT '',
    "attachment_mime" TEXT NOT NULL DEFAULT '',
    "meta_media_id" TEXT NOT NULL DEFAULT '',
    "source_type" TEXT NOT NULL DEFAULT '',
    "source_id" TEXT NOT NULL DEFAULT '',
    "source_url" TEXT NOT NULL DEFAULT '',
    "source_label" TEXT NOT NULL DEFAULT '',
    "reply_to_message_id" TEXT NOT NULL DEFAULT '',
    "reply_to_text" TEXT NOT NULL DEFAULT '',
    "reply_to_author" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "initial" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "name" TEXT NOT NULL,
    "lead" TEXT NOT NULL,
    "routing" TEXT NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "team_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","employee_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_tags" (
    "conversation_id" TEXT NOT NULL,
    "tag_name" TEXT NOT NULL,

    CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("conversation_id","tag_name")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "header_type" TEXT NOT NULL DEFAULT 'NONE',
    "header_text" TEXT NOT NULL DEFAULT '',
    "header_media" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "button_type" TEXT NOT NULL DEFAULT 'NONE',
    "button_text" TEXT NOT NULL DEFAULT '',
    "button_phone" TEXT NOT NULL DEFAULT '',
    "button_url" TEXT NOT NULL DEFAULT '',
    "meta_id" TEXT NOT NULL DEFAULT '',
    "synced_at" TEXT NOT NULL DEFAULT '-',
    "last_used" TEXT NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "shortcut" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "usage" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'رسالة واردة',
    "action" TEXT NOT NULL DEFAULT 'تعيين المحادثة',
    "target" TEXT NOT NULL DEFAULT 'بدون موظف',
    "delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "conditions_json" TEXT NOT NULL DEFAULT '[]',
    "actions_json" TEXT NOT NULL DEFAULT '[]',
    "created_at" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_queue" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "run_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "automation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "template_name" TEXT NOT NULL DEFAULT '',
    "scheduled_at" TEXT NOT NULL DEFAULT '',
    "sent" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "progress" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'قيد الإرسال',
    "error" TEXT NOT NULL DEFAULT '',
    "message_id" TEXT NOT NULL DEFAULT '',
    "sent_at" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_balances" (
    "tenant_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "campaign_balances_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "campaign_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "messages" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'قيد الانتظار',
    "moyasar_id" TEXT NOT NULL DEFAULT '',
    "payment_url" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,
    "completed_at" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "campaign_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "team" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "holidays" TEXT NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "interest" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL,
    "employee" TEXT NOT NULL,
    "last_contact" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_settings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "waba_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL DEFAULT '',
    "verify_token" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "x_consumer_key" TEXT NOT NULL DEFAULT '',
    "x_consumer_secret" TEXT NOT NULL DEFAULT '',
    "x_bearer_token" TEXT NOT NULL DEFAULT '',
    "x_access_token" TEXT NOT NULL DEFAULT '',
    "x_access_token_secret" TEXT NOT NULL DEFAULT '',
    "google_account_id" TEXT NOT NULL DEFAULT '',
    "google_location_id" TEXT NOT NULL DEFAULT '',
    "google_refresh_token" TEXT NOT NULL DEFAULT '',
    "webhook_url" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'tenant-demo',
    "is_platform_admin" INTEGER NOT NULL DEFAULT 0,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "employee_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_integrations" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL DEFAULT '',
    "email_address" TEXT NOT NULL DEFAULT '',
    "webhook_secret" TEXT NOT NULL DEFAULT '',
    "access_token" TEXT NOT NULL DEFAULT '',
    "refresh_token" TEXT NOT NULL DEFAULT '',
    "token_expires_at" TEXT NOT NULL DEFAULT '',
    "last_synced_at" TEXT NOT NULL DEFAULT '',
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "email_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_clients" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "subscription_status" TEXT NOT NULL,
    "renewal" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "employees" INTEGER NOT NULL DEFAULT 0,
    "last_activity" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "provider_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_subscriptions" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "renewal" TEXT NOT NULL,
    "billing_cycle" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,

    CONSTRAINT "provider_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_price" INTEGER NOT NULL DEFAULT 0,
    "employee_limit" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'باقة النمو',
    "status" TEXT NOT NULL DEFAULT 'تجربة',
    "employee_limit" INTEGER NOT NULL DEFAULT 3,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "billing_cycle" TEXT NOT NULL DEFAULT 'شهري',
    "renewal_at" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'قيد الانتظار',
    "moyasar_id" TEXT NOT NULL DEFAULT '',
    "payment_url" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,
    "completed_at" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "enabled" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "bot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_nodes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "position" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "bot_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TEXT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "templates_name_tenant_id_key" ON "templates"("name", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_email_key" ON "user_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invites_token_hash_key" ON "employee_invites"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
