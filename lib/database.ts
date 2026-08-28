import { prisma } from "./prisma";
import { createHash, randomUUID } from "crypto";
import { getPasswordValidationError, hashPassword, verifyPassword } from "./passwords";
import { decryptSecret, encryptSecret, integrationSecretFields } from "./secret-storage";
import { automationRules } from "../app/dashboard/data/automations";
import { templates } from "../app/dashboard/data/templates";
import type {
  AutomationRule,
  Campaign,
  Conversation,
  Customer,
  Employee,
  IntegrationSettings,
  Message,
  MessageTemplate,
  QuickReply,
  Tag,
  Team,
  WorkSchedule
} from "../app/dashboard/types";

let seedPromise: Promise<void> | null = null;
let schemaPromise: Promise<void> | null = null;
const defaultMetaAppId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || "";
const defaultMetaConfigId =
  process.env.NEXT_PUBLIC_META_CONFIG_ID ||
  process.env.META_CONFIG_ID ||
  process.env.WHATSAPP_CONFIGURATION_ID ||
  "";
const defaultGoogleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const defaultGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const isPostgresDatabase =
  process.env.DATABASE_URL?.startsWith("postgres://") || process.env.DATABASE_URL?.startsWith("postgresql://");
const defaultLoginEmail = "test@audiencew.sa";
const developmentDemoPassword = process.env.DEMO_LOGIN_PASSWORD?.trim() || "";
const demoUserAccounts = developmentDemoPassword ? [
  {
    id: "user-owner",
    employeeId: "emp-owner",
    name: "عبدالعزيز الكيالي",
    email: defaultLoginEmail,
    password: developmentDemoPassword,
    role: "مالك الحساب",
    tenantId: "tenant-demo"
  },
  {
    id: "user-support",
    employeeId: "emp-noura",
    name: "نورة القحطاني",
    email: "noura@audiencew.sa",
    password: developmentDemoPassword,
    role: "مالك الحساب",
    tenantId: "tenant-noura"
  }
] : [];

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  tenantId: string;
  profileLogo: string;
  isPlatformAdmin: number;
  sessionVersion: number;
  lastLoginAt: string;
  lastLoginIp: string;
  createdAt: string;
};

function parseEmailList(value?: string) {
  return Array.from(new Set(
    (value || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ));
}

// Platform-admin access is a persisted database permission. Environment values
// are only a bootstrap/provisioning aid and must never silently upgrade an
// arbitrary tenant account just because its email matches a string.
const configuredSuperAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
const configuredSuperAdminName = (process.env.SUPER_ADMIN_NAME || "Abdulaziz").trim() || "Super Admin";
const configuredSuperAdminPassword = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD?.trim() || "";
if (configuredSuperAdminPassword && !configuredSuperAdminEmail) {
  throw new Error("SUPER_ADMIN_EMAIL is required when SUPER_ADMIN_BOOTSTRAP_PASSWORD is set");
}
const configuredSuperAdminPasswordError = configuredSuperAdminPassword
  ? getPasswordValidationError(configuredSuperAdminPassword)
  : null;
if (configuredSuperAdminPasswordError) {
  throw new Error(`SUPER_ADMIN_BOOTSTRAP_PASSWORD is invalid: ${configuredSuperAdminPasswordError}`);
}
const platformAdminEmails = Array.from(new Set([
  ...parseEmailList(process.env.PLATFORM_ADMIN_EMAILS),
  ...(configuredSuperAdminEmail ? [configuredSuperAdminEmail] : [])
]));

export type ProviderClient = {
  id: string;
  company: string;
  owner: string;
  plan: string;
  status: "نشط" | "تجربة" | "بانتظار الربط";
  subscriptionStatus: "مدفوع" | "تجريبي" | "قيد التجهيز";
  renewal: string;
  phone: string;
  wabaId: string;
  conversations: number;
  employees: number;
  lastActivity: string;
  createdAt: string;
};

export type ProviderSubscription = {
  id: string;
  clientId: string;
  clientName: string;
  plan: string;
  status: "مدفوع" | "تجريبي" | "قيد التجهيز";
  amount: number;
  renewal: string;
  billingCycle: string;
  paymentMethod: string;
};

export type AdminLog = {
  id: string;
  at: string;
  clientId: string;
  clientName: string;
  source: string;
  level: "معلومة" | "تنبيه" | "خطأ";
  message: string;
};

export { hashPassword } from "./passwords";

async function runRequiredProductionMigrations() {
  if (!isPostgresDatabase) return;

  // Prisma selects every model field, so deploying a newly generated client
  // before these additive columns exist makes even read-only admin pages fail.
  // Keep this small compatibility bridge active in production even when the
  // broad legacy runtime schema repair is disabled. The statements are
  // idempotent and can be removed once every environment runs migrate deploy.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE campaign_payments ADD COLUMN IF NOT EXISTS amount_halalas INTEGER NOT NULL DEFAULT 0`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS amount_halalas INTEGER NOT NULL DEFAULT 0`
  );
  await prisma.$executeRawUnsafe(
    `UPDATE campaign_payments SET amount_halalas = CAST(ROUND(amount * 100) AS INTEGER) WHERE amount_halalas = 0 AND amount IS NOT NULL`
  );
  await prisma.$executeRawUnsafe(
    `UPDATE subscription_payments SET amount_halalas = CAST(ROUND(amount * 100) AS INTEGER) WHERE amount_halalas = 0 AND amount IS NOT NULL`
  );
}

async function runSchemaMigrations() {
  await runRequiredProductionMigrations();

  if (process.env.NODE_ENV === "production" && process.env.ENABLE_RUNTIME_SCHEMA_REPAIR !== "true") {
    return;
  }

  if (isPostgresDatabase) {
    await prisma.$executeRawUnsafe(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE tags ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key`);
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_activity_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_mime TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta_media_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_text TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_author TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_error TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_consumer_key TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_consumer_secret TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_bearer_token TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_access_token TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_access_token_secret TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS google_account_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS google_location_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS email_integrations (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      sender_name TEXT NOT NULL DEFAULT '',
      email_address TEXT NOT NULL DEFAULT '',
      webhook_secret TEXT NOT NULL DEFAULT '',
      access_token TEXT NOT NULL DEFAULT '',
      refresh_token TEXT NOT NULL DEFAULT '',
      token_expires_at TEXT NOT NULL DEFAULT '',
      last_synced_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE email_integrations ADD COLUMN IF NOT EXISTS last_synced_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_ran_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_waiting_node_title TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS bot_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE bot_settings DROP CONSTRAINT IF EXISTS bot_settings_tenant_id_key`);
    await prisma.$executeRawUnsafe(`ALTER TABLE bot_nodes ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS bot_nodes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      position INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE bot_nodes ADD COLUMN IF NOT EXISTS canvas_x DOUBLE PRECISION NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE bot_nodes ADD COLUMN IF NOT EXISTS canvas_y DOUBLE PRECISION NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS automation_queue (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
      run_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      progress TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_name TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ar'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
      phone TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'قيد الإرسال',
      error TEXT NOT NULL DEFAULT '',
      message_id TEXT NOT NULL DEFAULT '',
      sent_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_balances (
      tenant_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tenant_preferences (
      tenant_id TEXT PRIMARY KEY,
      leads_pipeline_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      messages INTEGER NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      amount_halalas INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'قيد الانتظار',
      moyasar_id TEXT NOT NULL DEFAULT '',
      payment_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE campaign_payments ADD COLUMN IF NOT EXISTS amount_halalas INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS id TEXT`);
    await prisma.$executeRawUnsafe(`UPDATE templates SET id = 'tmpl-' || tenant_id || '-' || name WHERE id IS NULL`);
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE templates ALTER COLUMN id SET NOT NULL`);
      await prisma.$executeRawUnsafe(`ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_pkey`);
      await prisma.$executeRawUnsafe(`ALTER TABLE templates ADD CONSTRAINT templates_pkey PRIMARY KEY (id)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_name_tenant_id_key`);
      await prisma.$executeRawUnsafe(`ALTER TABLE templates ADD CONSTRAINT templates_name_tenant_id_key UNIQUE (name, tenant_id)`);
    } catch (error) {
      console.error("Template table primary key migration failed", error);
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS off_hours_notified_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS is_platform_admin INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS profile_logo TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS last_login_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS last_login_ip TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE employee_invites ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'employee_activation'`);
    for (const email of platformAdminEmails) {
      await prisma.$executeRawUnsafe(`UPDATE user_accounts SET is_platform_admin = 1 WHERE email = $1 AND is_platform_admin = 1`, email);
    }
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      monthly_price INTEGER NOT NULL DEFAULT 0,
      employee_limit INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS monthly_price INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS employee_limit INTEGER NOT NULL DEFAULT 1`);
    await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1`);
    await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT ''`);
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_name_key`);
      await prisma.$executeRawUnsafe(`ALTER TABLE plans ADD CONSTRAINT plans_name_key UNIQUE (name)`);
    } catch (error) {
      console.error("Plans name uniqueness migration failed", error);
    }
    // One-time repair: an earlier deploy of this feature created "plans" with
    // only id/name (English placeholders), before monthly_price/employee_limit
    // existed as columns - those rows got the bare column defaults (0/1) once
    // the columns were added above. Backfill them with the real tier values.
    await prisma.$executeRawUnsafe(
      `UPDATE plans SET name = $1, monthly_price = $2, employee_limit = $3, sort_order = $4, created_at = COALESCE(NULLIF(created_at, ''), 'اليوم'), updated_at = COALESCE(NULLIF(updated_at, ''), 'اليوم') WHERE name = 'Starter'`,
      "باقة البداية",
      249,
      1,
      1
    );
    await prisma.$executeRawUnsafe(
      `UPDATE plans SET name = $1, monthly_price = $2, employee_limit = $3, sort_order = $4, created_at = COALESCE(NULLIF(created_at, ''), 'اليوم'), updated_at = COALESCE(NULLIF(updated_at, ''), 'اليوم') WHERE name = 'Growth'`,
      "باقة النمو",
      499,
      3,
      2
    );
    await prisma.$executeRawUnsafe(
      `UPDATE plans SET name = $1, monthly_price = $2, employee_limit = $3, sort_order = $4, created_at = COALESCE(NULLIF(created_at, ''), 'اليوم'), updated_at = COALESCE(NULLIF(updated_at, ''), 'اليوم') WHERE name = 'Business'`,
      "باقة الأعمال",
      999,
      10,
      3
    );
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      company_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'باقة النمو',
      status TEXT NOT NULL DEFAULT 'تجربة',
      employee_limit INTEGER NOT NULL DEFAULT 3,
      amount INTEGER NOT NULL DEFAULT 0,
      billing_cycle TEXT NOT NULL DEFAULT 'شهري',
      renewal_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS owner_email TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'باقة النمو'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'تجربة'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS employee_limit INTEGER NOT NULL DEFAULT 3`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'شهري'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT ''`);
    try {
      await prisma.$executeRawUnsafe(`UPDATE subscriptions SET tenant_id = id WHERE tenant_id IS NULL`);
      await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ALTER COLUMN tenant_id SET NOT NULL`);
      await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tenant_id_key`);
      await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tenant_id_key UNIQUE (tenant_id)`);
    } catch (error) {
      console.error("Subscriptions tenant_id constraint migration failed", error);
    }
    // The subscriptions table pre-existed in prod (see CREATE TABLE IF NOT
    // EXISTS above) with leftover NOT NULL columns from whatever created it
    // originally (workspace_id, plan_id, ...) - none of them are part of
    // this schema and nothing here writes to them, so every insert violated
    // one NOT NULL constraint after another. Rather than fix these one at a
    // time as each surfaces, find every NOT NULL column outside our known
    // set and relax it in one pass.
    try {
      const knownColumns = [
        "id",
        "tenant_id",
        "company_name",
        "owner_name",
        "owner_email",
        "plan",
        "status",
        "employee_limit",
        "amount",
        "billing_cycle",
        "renewal_at",
        "created_at",
        "updated_at"
      ];
      const strayColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' AND is_nullable = 'NO' AND column_default IS NULL`
      );
      for (const { column_name } of strayColumns) {
        if (knownColumns.includes(column_name)) continue;
        await prisma.$executeRawUnsafe(`ALTER TABLE subscriptions ALTER COLUMN "${column_name}" DROP NOT NULL`);
      }
    } catch (error) {
      console.error("Subscriptions stray-column constraint relax failed", error);
    }
    // Same leftover placeholder batch (see plans repair above) included a
    // fourth "Enterprise" row never part of the three-tier design - drop it
    // now that we can confirm no subscription references it.
    await prisma.$executeRawUnsafe(
      `DELETE FROM plans WHERE name = 'Enterprise' AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.plan = plans.name)`
    );
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS subscription_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      amount_halalas INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'قيد الانتظار',
      moyasar_id TEXT NOT NULL DEFAULT '',
      payment_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS amount_halalas INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'قيد الانتظار'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS moyasar_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS payment_url TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS completed_at TEXT NOT NULL DEFAULT ''`);
    // The plan a checkout is upgrading to is staged here rather than
    // written straight to subscriptions.plan/employee_limit, so a tenant
    // only gets the new plan's benefits once payment actually confirms.
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS plan_employee_limit INTEGER NOT NULL DEFAULT 0`);
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    initial TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    last_message TEXT NOT NULL,
    status TEXT NOT NULL,
    assignee TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 0,
    window_expired INTEGER NOT NULL DEFAULT 0,
    last_activity_at TEXT NOT NULL DEFAULT '',
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'
  )`);
  const customerColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(customers)`);
  if (!customerColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE customers ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  const conversationColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(conversations)`);
  if (!conversationColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  if (!conversationColumns.some((column) => column.name === "channel")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'`);
  }
  if (!conversationColumns.some((column) => column.name === "last_activity_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT ''`);
  }
  if (!conversationColumns.some((column) => column.name === "bot_ran_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN bot_ran_at TEXT NOT NULL DEFAULT ''`);
  }
  if (!conversationColumns.some((column) => column.name === "bot_waiting_node_title")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN bot_waiting_node_title TEXT NOT NULL DEFAULT ''`);
  }
  if (!conversationColumns.some((column) => column.name === "off_hours_notified_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN off_hours_notified_at TEXT NOT NULL DEFAULT ''`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    text TEXT NOT NULL,
    time TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    attachment_type TEXT NOT NULL DEFAULT '',
    attachment_url TEXT NOT NULL DEFAULT '',
    attachment_name TEXT NOT NULL DEFAULT '',
    attachment_mime TEXT NOT NULL DEFAULT '',
    meta_media_id TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    source_label TEXT NOT NULL DEFAULT '',
    reply_to_message_id TEXT NOT NULL DEFAULT '',
    reply_to_text TEXT NOT NULL DEFAULT '',
    reply_to_author TEXT NOT NULL DEFAULT '',
    delivery_status TEXT NOT NULL DEFAULT '',
    delivery_error TEXT NOT NULL DEFAULT ''
  )`);
  const messageColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(messages)`);
  if (!messageColumns.some((column) => column.name === "created_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`);
  }
  if (!messageColumns.some((column) => column.name === "author")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN author TEXT NOT NULL DEFAULT ''`);
  }
  for (const columnName of ["attachment_type", "attachment_url", "attachment_name", "attachment_mime", "meta_media_id", "source_type", "source_id", "source_url", "source_label", "reply_to_message_id", "reply_to_text", "reply_to_author", "delivery_status", "delivery_error"]) {
    if (!messageColumns.some((column) => column.name === columnName)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN ${columnName} TEXT NOT NULL DEFAULT ''`);
    }
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    permissions TEXT NOT NULL,
    email TEXT NOT NULL,
    initial TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'
  )`);
  const employeeColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(employees)`);
  if (!employeeColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE employees ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
    name TEXT NOT NULL,
    lead TEXT NOT NULL,
    routing TEXT NOT NULL
  )`);
  const teamColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(teams)`);
  if (!teamColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE teams ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    PRIMARY KEY (team_id, employee_id)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    description TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'
  )`);
  const tagColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(tags)`);
  if (!tagColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE tags ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    PRIMARY KEY (conversation_id, tag_name)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'MARKETING',
    language TEXT NOT NULL,
    status TEXT NOT NULL,
    header_type TEXT NOT NULL DEFAULT 'NONE',
    header_text TEXT NOT NULL DEFAULT '',
    header_media TEXT NOT NULL DEFAULT '',
    footer TEXT NOT NULL DEFAULT '',
    button_type TEXT NOT NULL DEFAULT 'NONE',
    button_text TEXT NOT NULL DEFAULT '',
    button_phone TEXT NOT NULL DEFAULT '',
    button_url TEXT NOT NULL DEFAULT '',
    meta_id TEXT NOT NULL DEFAULT '',
    synced_at TEXT NOT NULL DEFAULT '-',
    last_used TEXT NOT NULL,
    UNIQUE(name, tenant_id)
  )`);
  const templateColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(templates)`);
  if (!templateColumns.some((column) => column.name === "id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE templates RENAME TO templates_old`);
    await prisma.$executeRawUnsafe(`CREATE TABLE templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'MARKETING',
      language TEXT NOT NULL,
      status TEXT NOT NULL,
      header_type TEXT NOT NULL DEFAULT 'NONE',
      header_text TEXT NOT NULL DEFAULT '',
      header_media TEXT NOT NULL DEFAULT '',
      footer TEXT NOT NULL DEFAULT '',
      button_type TEXT NOT NULL DEFAULT 'NONE',
      button_text TEXT NOT NULL DEFAULT '',
      button_phone TEXT NOT NULL DEFAULT '',
      button_url TEXT NOT NULL DEFAULT '',
      meta_id TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL DEFAULT '-',
      last_used TEXT NOT NULL,
      UNIQUE(name, tenant_id)
    )`);
    await prisma.$executeRawUnsafe(`INSERT INTO templates (id, tenant_id, name, message, type, category, language, status, header_type, header_text, header_media, footer, button_type, button_text, button_phone, button_url, meta_id, synced_at, last_used)
      SELECT 'tmpl-tenant-demo-' || name, 'tenant-demo', name, message, type, category, language, status, header_type, header_text, header_media, footer, button_type, button_text, button_phone, button_url, meta_id, synced_at, last_used FROM templates_old`);
    await prisma.$executeRawUnsafe(`DROP TABLE templates_old`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS quick_replies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
    shortcut TEXT NOT NULL,
    text TEXT NOT NULL,
    team TEXT NOT NULL,
    usage INTEGER NOT NULL DEFAULT 0
  )`);
  const quickReplyColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(quick_replies)`);
  if (!quickReplyColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE quick_replies ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'رسالة واردة',
    action TEXT NOT NULL DEFAULT 'تعيين المحادثة',
    target TEXT NOT NULL DEFAULT 'بدون موظف',
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    conditions_json TEXT NOT NULL DEFAULT '[]',
    actions_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  )`);
  const automationColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(automation_rules)`);
  const automationTextColumns = [
    ["trigger", "رسالة واردة"],
    ["action", "تعيين المحادثة"],
    ["target", "بدون موظف"]
  ];
  for (const [columnName, defaultValue] of automationTextColumns) {
    if (!automationColumns.some((column) => column.name === columnName)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE automation_rules ADD COLUMN ${columnName} TEXT NOT NULL DEFAULT '${defaultValue}'`);
    }
  }
  if (!automationColumns.some((column) => column.name === "delay_minutes")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE automation_rules ADD COLUMN delay_minutes INTEGER NOT NULL DEFAULT 0`);
  }
  for (const columnName of ["conditions_json", "actions_json"]) {
    if (!automationColumns.some((column) => column.name === columnName)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE automation_rules ADD COLUMN ${columnName} TEXT NOT NULL DEFAULT '[]'`);
    }
  }
  if (!automationColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE automation_rules ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS automation_queue (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
    run_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    progress TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  const campaignColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(campaigns)`);
  const campaignTextColumns = [
    ["tenant_id", "tenant-demo"],
    ["channel", "whatsapp"],
    ["template_name", ""],
    ["language", "ar"],
    ["scheduled_at", ""]
  ];
  for (const [columnName, defaultValue] of campaignTextColumns) {
    if (!campaignColumns.some((column) => column.name === columnName)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE campaigns ADD COLUMN ${columnName} TEXT NOT NULL DEFAULT '${defaultValue}'`);
    }
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_recipients (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
    phone TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'قيد الإرسال',
    error TEXT NOT NULL DEFAULT '',
    message_id TEXT NOT NULL DEFAULT '',
    sent_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_balances (
    tenant_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tenant_preferences (
    tenant_id TEXT PRIMARY KEY,
    leads_pipeline_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    messages INTEGER NOT NULL,
    amount REAL NOT NULL,
    amount_halalas INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'قيد الانتظار',
    moyasar_id TEXT NOT NULL DEFAULT '',
    payment_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT ''
  )`);
  const campaignPaymentColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(campaign_payments)`);
  if (!campaignPaymentColumns.some((column) => column.name === "amount_halalas")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE campaign_payments ADD COLUMN amount_halalas INTEGER NOT NULL DEFAULT 0`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS work_schedules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
    team TEXT NOT NULL,
    days TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    status TEXT NOT NULL,
    holidays TEXT NOT NULL
  )`);
  const workScheduleColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(work_schedules)`);
  if (!workScheduleColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE work_schedules ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS integration_settings (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    business_name TEXT NOT NULL,
    waba_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    waba_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    config_id TEXT NOT NULL DEFAULT '',
    verify_token TEXT NOT NULL,
    access_token TEXT NOT NULL,
    x_consumer_key TEXT NOT NULL DEFAULT '',
    x_consumer_secret TEXT NOT NULL DEFAULT '',
    x_bearer_token TEXT NOT NULL DEFAULT '',
    x_access_token TEXT NOT NULL DEFAULT '',
    x_access_token_secret TEXT NOT NULL DEFAULT '',
    google_account_id TEXT NOT NULL DEFAULT '',
    google_location_id TEXT NOT NULL DEFAULT '',
    google_refresh_token TEXT NOT NULL DEFAULT '',
    webhook_url TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  for (const statement of [
    `ALTER TABLE integration_settings ADD COLUMN x_consumer_key TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integration_settings ADD COLUMN x_consumer_secret TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integration_settings ADD COLUMN x_bearer_token TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integration_settings ADD COLUMN x_access_token TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integration_settings ADD COLUMN x_access_token_secret TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integration_settings ADD COLUMN google_account_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integration_settings ADD COLUMN google_location_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE integration_settings ADD COLUMN google_refresh_token TEXT NOT NULL DEFAULT ''`
  ]) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch {
      // Existing databases already have this column.
    }
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS email_integrations (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    sender_name TEXT NOT NULL DEFAULT '',
    email_address TEXT NOT NULL DEFAULT '',
    webhook_secret TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    token_expires_at TEXT NOT NULL DEFAULT '',
    last_synced_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`);
  const emailIntegrationColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(email_integrations)`);
  if (!emailIntegrationColumns.some((column) => column.name === "sender_name")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE email_integrations ADD COLUMN sender_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!emailIntegrationColumns.some((column) => column.name === "last_synced_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE email_integrations ADD COLUMN last_synced_at TEXT NOT NULL DEFAULT ''`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS user_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
    profile_logo TEXT NOT NULL DEFAULT '',
    is_platform_admin INTEGER NOT NULL DEFAULT 0,
    session_version INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT NOT NULL DEFAULT '',
    last_login_ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  const userAccountColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(user_accounts)`);
  if (!userAccountColumns.some((column) => column.name === "is_platform_admin")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0`);
  }
  if (!userAccountColumns.some((column) => column.name === "session_version")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0`);
  }
  if (!userAccountColumns.some((column) => column.name === "profile_logo")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN profile_logo TEXT NOT NULL DEFAULT ''`);
  }
  if (!userAccountColumns.some((column) => column.name === "last_login_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN last_login_at TEXT NOT NULL DEFAULT ''`);
  }
  if (!userAccountColumns.some((column) => column.name === "last_login_ip")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN last_login_ip TEXT NOT NULL DEFAULT ''`);
  }
  for (const email of platformAdminEmails) {
    await prisma.$executeRawUnsafe(`UPDATE user_accounts SET is_platform_admin = 1 WHERE email = ? AND is_platform_admin = 1`, email);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS employee_invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'employee_activation'
  )`);
  const employeeInviteColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(employee_invites)`);
  if (!employeeInviteColumns.some((column) => column.name === "purpose")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE employee_invites ADD COLUMN purpose TEXT NOT NULL DEFAULT 'employee_activation'`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS provider_clients (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    owner TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    subscription_status TEXT NOT NULL,
    renewal TEXT NOT NULL,
    phone TEXT NOT NULL,
    waba_id TEXT NOT NULL,
    conversations INTEGER NOT NULL DEFAULT 0,
    employees INTEGER NOT NULL DEFAULT 0,
    last_activity TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS provider_subscriptions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    renewal TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    payment_method TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS admin_logs (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    source TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    monthly_price INTEGER NOT NULL DEFAULT 0,
    employee_limit INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'باقة النمو',
    status TEXT NOT NULL DEFAULT 'تجربة',
    employee_limit INTEGER NOT NULL DEFAULT 3,
    amount INTEGER NOT NULL DEFAULT 0,
    billing_cycle TEXT NOT NULL DEFAULT 'شهري',
    renewal_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS subscription_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_halalas INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'قيد الانتظار',
    moyasar_id TEXT NOT NULL DEFAULT '',
    payment_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT '',
    plan_name TEXT NOT NULL DEFAULT '',
    plan_employee_limit INTEGER NOT NULL DEFAULT 0
  )`);
  const subscriptionPaymentColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(subscription_payments)`);
  if (!subscriptionPaymentColumns.some((column) => column.name === "amount_halalas")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN amount_halalas INTEGER NOT NULL DEFAULT 0`);
  }
  if (!subscriptionPaymentColumns.some((column) => column.name === "plan_name")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN plan_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!subscriptionPaymentColumns.some((column) => column.name === "plan_employee_limit")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN plan_employee_limit INTEGER NOT NULL DEFAULT 0`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS bot_settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS bot_nodes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    position INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    canvas_x REAL NOT NULL DEFAULT 0,
    canvas_y REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  const botNodeColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(bot_nodes)`);
  for (const columnName of ["canvas_x", "canvas_y"]) {
    if (!botNodeColumns.some((column) => column.name === columnName)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE bot_nodes ADD COLUMN ${columnName} REAL NOT NULL DEFAULT 0`);
    }
  }
}

/**
 * runSchemaMigrations() is hundreds of ALTER/CREATE TABLE IF NOT EXISTS
 * statements - idempotent, but expensive to replay on every call. It was
 * being invoked directly (uncached) from 30+ call sites across the app,
 * so nearly every request - including every inbound channel webhook -
 * re-ran the entire migration list against Postgres. Cache it per
 * serverless instance the same way seedDatabase() already is below.
 */
export async function ensureSchema() {
  schemaPromise ??= runSchemaMigrations().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

async function seedDatabase() {
  await ensureSchema();
  await prisma.$transaction(async (tx) => {
    await tx.emailIntegration.upsert({
      where: { id: "primary-email" },
      update: {},
      create: {
        id: "primary-email",
        provider: "webhook",
        status: "not_connected",
        webhookSecret: encryptSecret(process.env.EMAIL_WEBHOOK_SECRET || randomUUID()),
        updatedAt: new Date().toISOString()
      }
    });
    await tx.integrationSetting.upsert({
      where: { id: "meta-whatsapp" },
      update: {},
      create: {
        id: "meta-whatsapp",
        provider: "whatsapp_cloud",
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        appId: defaultMetaAppId,
        configId: "",
        verifyToken: randomUUID(),
        accessToken: "",
        webhookUrl: "/api/meta/webhook",
        updatedAt: "اليوم"
      }
    });
    await tx.integrationSetting.upsert({
      where: { id: "meta-instagram" },
      update: {},
      create: {
        id: "meta-instagram",
        provider: "instagram",
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        appId: defaultMetaAppId,
        configId: "",
        verifyToken: randomUUID(),
        accessToken: "",
        webhookUrl: "/api/meta/webhook",
        updatedAt: "اليوم"
      }
    });
    await tx.integrationSetting.upsert({
      where: { id: "meta-facebook" },
      update: {},
      create: {
        id: "meta-facebook",
        provider: "facebook",
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        appId: defaultMetaAppId,
        configId: "",
        verifyToken: randomUUID(),
        accessToken: "",
        webhookUrl: "/api/meta/webhook",
        updatedAt: "اليوم"
      }
    });
    await tx.integrationSetting.upsert({
      where: { id: "telegram-bot" },
      update: {},
      create: {
        id: "telegram-bot",
        provider: "telegram",
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        appId: "",
        configId: "",
        verifyToken: randomUUID(),
        accessToken: "",
        webhookUrl: "/api/telegram/webhook",
        updatedAt: "اليوم"
      }
    });
    await tx.integrationSetting.upsert({
      where: { id: "x-channel" },
      update: {},
      create: {
        id: "x-channel",
        provider: "x",
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        appId: "",
        configId: "",
        verifyToken: randomUUID(),
        accessToken: "",
        webhookUrl: "/api/x/webhook",
        updatedAt: "اليوم"
      }
    });
    await tx.integrationSetting.upsert({
      where: { id: "google-maps" },
      update: {},
      create: {
        id: "google-maps",
        provider: "google_maps",
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        appId: defaultGoogleClientId,
        configId: "",
        verifyToken: randomUUID(),
        accessToken: "",
        webhookUrl: "/api/google/reviews/sync",
        updatedAt: "اليوم"
      }
    });
    await tx.integrationSetting.upsert({
      where: { id: "email-channel" },
      update: {},
      create: {
        id: "email-channel",
        provider: "email",
        status: "pending",
        businessName: "",
        wabaName: "",
        phoneNumber: "",
        phoneNumberId: "",
        wabaId: "",
        appId: "",
        configId: "",
        verifyToken: randomUUID(),
        accessToken: "",
        webhookUrl: "/api/email/inbound",
        updatedAt: "اليوم"
      }
    });

    for (const account of process.env.NODE_ENV === "production" ? [] : demoUserAccounts) {
      await tx.userAccount.upsert({
        where: { id: account.id },
        update: { email: account.email, name: account.name, role: account.role, tenantId: account.tenantId },
        create: {
          id: account.id,
          name: account.name,
          email: account.email,
          passwordHash: hashPassword(account.password),
          role: account.role,
          tenantId: account.tenantId,
          createdAt: "اليوم"
        }
      });

      await tx.employee.upsert({
        where: { id: account.employeeId },
        update: {
          name: account.name,
          email: account.email,
          role: account.role,
          status: "متصل",
          permissions: "الكل",
          initial: account.name.slice(0, 1),
          tenantId: account.tenantId
        },
        create: {
          id: account.employeeId,
          name: account.name,
          email: account.email,
          role: account.role,
          status: "متصل",
          permissions: "الكل",
          initial: account.name.slice(0, 1),
          tenantId: account.tenantId
        }
      });
    }

    // Platform admins should be provisioned explicitly. This bootstrap keeps
    // already-admin accounts usable and can create the configured first admin,
    // but it deliberately refuses to promote an existing tenant account based
    // on email alone.
    for (const email of platformAdminEmails) {
      const existingAdminAccount = await tx.userAccount.findUnique({ where: { email } });
      if (existingAdminAccount) {
        if (existingAdminAccount.isPlatformAdmin !== 1) {
          console.warn(`SUPER_ADMIN_EMAIL/PLATFORM_ADMIN_EMAILS matched an existing non-admin account; not promoting ${email}. Use scripts/create-super-admin.mjs or an admin invite.`);
          continue;
        }
        const shouldApplyBootstrapPassword =
          email === configuredSuperAdminEmail &&
          Boolean(configuredSuperAdminPassword) &&
          !verifyPassword(configuredSuperAdminPassword, existingAdminAccount.passwordHash).valid;
        const bootstrapPasswordHash = shouldApplyBootstrapPassword
          ? hashPassword(configuredSuperAdminPassword)
          : undefined;
        if (existingAdminAccount.isPlatformAdmin !== 1 || bootstrapPasswordHash) {
          await tx.userAccount.update({
            where: { email },
            data: {
              isPlatformAdmin: 1,
              ...(bootstrapPasswordHash ? { passwordHash: bootstrapPasswordHash, sessionVersion: { increment: 1 } } : {})
            }
          });
        }
        continue;
      }

      if (email !== configuredSuperAdminEmail || !configuredSuperAdminPassword) continue;

      await tx.userAccount.create({
        data: {
          id: `user-platform-${createHash("sha256").update(email).digest("hex").slice(0, 10)}`,
          name: email === configuredSuperAdminEmail ? configuredSuperAdminName : email.split("@")[0],
          email,
          passwordHash: email === configuredSuperAdminEmail && configuredSuperAdminPassword
            ? hashPassword(configuredSuperAdminPassword)
            : "",
          role: "مالك الحساب",
          tenantId: "tenant-demo",
          isPlatformAdmin: 1,
          createdAt: "اليوم"
        }
      });
    }

    // One-time seed: only runs while the plans table is empty, so admin
    // edits made afterward (price/limit/active changes) are never clobbered
    // by this re-running on a later cold start.
    const existingPlanCount = await tx.plan.count();
    if (existingPlanCount === 0) {
      const nowLabel = "اليوم";
      const defaultPlans = [
        { id: "plan-starter", name: "باقة البداية", monthlyPrice: 249, employeeLimit: 1, sortOrder: 1 },
        { id: "plan-growth", name: "باقة النمو", monthlyPrice: 499, employeeLimit: 3, sortOrder: 2 },
        { id: "plan-business", name: "باقة الأعمال", monthlyPrice: 999, employeeLimit: 10, sortOrder: 3 }
      ];
      for (const plan of defaultPlans) {
        await tx.plan.create({
          data: { ...plan, active: 1, createdAt: nowLabel, updatedAt: nowLabel }
        });
      }
    }

    // Synthetic records used by the browser E2E suite must never be allowed
    // to block production authentication. Some long-lived production
    // databases still contain legacy workspace-scoped rows that can conflict
    // with these fixtures. Keep them opt-in in production and enabled by
    // default for local/test environments.
    const shouldSeedE2EFixtures = process.env.NODE_ENV !== "production" || process.env.E2E_SEED_ENABLED === "1";
    if (shouldSeedE2EFixtures) {
      const businessHoursRule = automationRules.find((rule) => rule.id === "auto-business-hours");
      if (businessHoursRule) {
      await tx.automationRule.upsert({
        where: { id: businessHoursRule.id },
        update: {},
        create: {
          id: businessHoursRule.id,
          tenantId: "tenant-demo",
          name: businessHoursRule.name,
          description: businessHoursRule.description,
          trigger: businessHoursRule.trigger,
          action: businessHoursRule.action,
          target: businessHoursRule.target,
          delayMinutes: businessHoursRule.delayMinutes,
          conditionsJson: JSON.stringify(businessHoursRule.conditions),
          actionsJson: JSON.stringify(businessHoursRule.actions),
          createdAt: businessHoursRule.createdAt,
          enabled: 1
        }
        });
      }

    const welcomeTemplate = templates.find((template) => template.name === "welcome");
    if (welcomeTemplate) {
      await tx.template.upsert({
        where: { name_tenantId: { name: welcomeTemplate.name, tenantId: "tenant-demo" } },
        update: {},
        create: {
          id: "tpl-welcome",
          tenantId: "tenant-demo",
          name: welcomeTemplate.name,
          message: welcomeTemplate.message,
          type: welcomeTemplate.type || "خدمة",
          category: welcomeTemplate.category || "UTILITY",
          language: welcomeTemplate.language || "ar",
          status: welcomeTemplate.status || "معتمد",
          lastUsed: welcomeTemplate.lastUsed || "-"
        }
      });
    }

    await tx.quickReply.upsert({
      where: { id: "qr-audience-welcome" },
      update: {},
      create: {
        id: "qr-audience-welcome",
        tenantId: "tenant-demo",
        shortcut: "/مرحبا-اودينس",
        text: welcomeTemplate?.message || "مرحباً، سعداء بتواصلك معنا.",
        team: "الكل",
        usage: 0
      }
    });

    await tx.tenantPreference.upsert({
      where: { tenantId: "tenant-demo" },
      update: {},
      create: { tenantId: "tenant-demo", leadsPipelineEnabled: 1, updatedAt: new Date().toISOString() }
    });

    const readyCampaignExists = await tx.campaign.findUnique({ where: { id: "camp-e2e-ready" } });
    await tx.campaignBalance.upsert({
      where: { tenantId: "tenant-demo" },
      update: readyCampaignExists ? {} : { balance: 10, updatedAt: new Date().toISOString() },
      create: { tenantId: "tenant-demo", balance: 10, updatedAt: new Date().toISOString() }
    });

    await tx.campaign.upsert({
      where: { id: "camp-e2e-ready" },
      update: {},
      create: {
        id: "camp-e2e-ready",
        tenantId: "tenant-demo",
        name: "حملة واتساب جاهزة للإرسال",
        channel: "whatsapp",
        templateName: "welcome",
        language: "ar",
        scheduledAt: "2099-01-01T09:00:00.000Z",
        sent: 0,
        total: 1,
        progress: "0%",
        status: "مجدولة",
        updatedAt: "اليوم"
      }
    });
      await tx.campaignRecipient.upsert({
      where: { id: "cr-camp-e2e-ready-demo" },
      update: {},
      create: {
        id: "cr-camp-e2e-ready-demo",
        campaignId: "camp-e2e-ready",
        tenantId: "tenant-demo",
        phone: "966500000001",
        name: "عميل تجريبي",
        status: "قيد الإرسال",
        createdAt: new Date().toISOString()
      }
      });
    }

  }, { timeout: 20000, maxWait: 10000 });
}

async function ensureSeeded() {
  // If seeding fails, seedPromise must not stay set to the rejected promise -
  // `??=` only re-runs seedDatabase() when seedPromise is null/undefined, so a
  // single transient failure (e.g. a cold-start DB timeout) would otherwise
  // permanently break every request this server instance ever handles again,
  // since it keeps awaiting and re-throwing that same cached rejection.
  seedPromise ??= seedDatabase().catch((error) => {
    seedPromise = null;
    throw error;
  });
  await seedPromise;
}

function parseAutomationConditions(value: string): AutomationRule["conditions"] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((condition) => condition && typeof condition === "object")
      .map((condition) => ({
        field: typeof condition.field === "string" ? condition.field : "الرسالة تحتوي على",
        operator: typeof condition.operator === "string" ? condition.operator : "يساوي",
        value: typeof condition.value === "string" ? condition.value : ""
      }));
  } catch {
    return [];
  }
}

function parseAutomationActions(value: string): AutomationRule["actions"] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((action) => action && typeof action === "object")
      .map((action) => ({
        type: typeof action.type === "string" ? action.type : "فتح المحادثة",
        target: typeof action.target === "string" ? action.target : "لا يحتاج اختيار"
      }));
  } catch {
    return [];
  }
}

export async function getCustomers(tenantId = "tenant-demo"): Promise<Customer[]> {
  await ensureSeeded();
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    include: {
      conversations: {
        orderBy: {
          lastActivityAt: "desc"
        },
        include: {
          tags: true
        }
      }
    }
  });

  return customers.map((customer) => {
    const channels = customer.id.startsWith("ig-")
      ? ["instagram" as const]
      : customer.id.startsWith("fb-")
        ? ["facebook" as const]
      : customer.id.startsWith("tg-")
        ? ["telegram" as const]
        : customer.id.startsWith("x-")
          ? ["x" as const]
          : customer.id.startsWith("gm-")
            ? ["google_maps" as const]
          : customer.id.startsWith("email-")
            ? ["email" as const]
          : customer.conversations.length
            ? Array.from(new Set(customer.conversations.map((conversation) => conversation.channel as Customer["channels"][number])))
            : ["whatsapp" as const];

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      initial: customer.initial,
      channels,
      tags: Array.from(new Set(customer.conversations.flatMap((conversation) => conversation.tags.map((tag) => tag.tagName))))
    };
  });
}

export async function getConversations(tenantId = "tenant-demo", assigneeName?: string): Promise<Conversation[]> {
  await ensureSeeded();
  const conversations = await prisma.conversation.findMany({
    where: assigneeName ? { tenantId, assignee: assigneeName } : { tenantId },
    orderBy: {
      lastActivityAt: "desc"
    },
    include: {
      customer: true,
      messages: true,
      tags: true
    }
  });

  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  return conversations.map((conversation) => {
    const messages = conversation.messages.map<Message>((message) => ({
      id: message.id,
      direction: message.direction as Message["direction"],
      text: message.text,
      time: message.time,
      createdAt: message.createdAt || undefined,
      author: message.author || undefined,
      attachment: message.attachmentType && message.attachmentUrl ? {
        type: message.attachmentType as NonNullable<Message["attachment"]>["type"],
        url: message.attachmentUrl,
        name: message.attachmentName || message.text,
        mimeType: message.attachmentMime || undefined
      } : undefined,
      source: message.sourceType || message.sourceId || message.sourceUrl || message.sourceLabel ? {
        type: message.sourceType || "post",
        id: message.sourceId || undefined,
        url: message.sourceUrl || undefined,
        label: message.sourceLabel || undefined
      } : undefined,
      replyTo: message.replyToMessageId || message.replyToText || message.replyToAuthor ? {
        messageId: message.replyToMessageId || undefined,
        text: message.replyToText || undefined,
        author: message.replyToAuthor || undefined
      } : undefined,
      deliveryStatus: (message.deliveryStatus || undefined) as Message["deliveryStatus"],
      deliveryError: message.deliveryError || undefined
    }));
    const lastCustomerMessage = conversation.messages
      .filter((message) => message.direction === "in" && message.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const lastCustomerMessageAt = lastCustomerMessage?.createdAt ? new Date(lastCustomerMessage.createdAt).getTime() : NaN;
    const isWhatsAppWindowExpired =
      (conversation.channel || "whatsapp") === "whatsapp" &&
      (Number.isNaN(lastCustomerMessageAt)
        ? Boolean(conversation.windowExpired)
        : now - lastCustomerMessageAt >= dayInMs);

    return {
      id: conversation.id,
      channel: (conversation.channel || "whatsapp") as Conversation["channel"],
      customer: conversation.customer.name,
      phone: conversation.customer.phone,
      initial: conversation.customer.initial,
      lastMessage: conversation.lastMessage,
      status: conversation.status as Conversation["status"],
      assignee: conversation.assignee,
      unread: conversation.unread || undefined,
      windowExpired: isWhatsAppWindowExpired || undefined,
      lastActivityAt: conversation.lastActivityAt || undefined,
      firstMessageTime: messages[0]?.time,
      lastMessageTime: messages.at(-1)?.time,
      firstMessageAt: messages.find((message) => message.createdAt)?.createdAt,
      lastMessageAt: messages.findLast((message) => message.createdAt)?.createdAt || conversation.lastActivityAt || undefined,
      tags: conversation.tags.map((tag) => tag.tagName),
      messages
    };
  });
}

export async function getEmployees(tenantId = "tenant-demo"): Promise<Employee[]> {
  await ensureSeeded();
  const [rows, accounts] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId } }),
    prisma.userAccount.findMany({
      where: { tenantId },
      select: { email: true, lastLoginAt: true, lastLoginIp: true }
    })
  ]);
  const accountsByEmail = new Map(accounts.map((account) => [account.email.toLowerCase(), account]));

  return rows.map((employee) => {
    const account = accountsByEmail.get(employee.email.toLowerCase());
    return {
      id: employee.id,
      name: employee.name,
      role: employee.role as Employee["role"],
      status: employee.status as Employee["status"],
      permissions: employee.permissions,
      email: employee.email,
      initial: employee.initial,
      hasAccount: Boolean(account),
      lastLoginAt: account?.lastLoginAt || "",
      lastLoginIp: account?.lastLoginIp || ""
    };
  });
}

export async function getTeams(tenantId = "tenant-demo"): Promise<Team[]> {
  await ensureSeeded();
  const rows = await prisma.team.findMany({
    where: { tenantId },
    include: {
      members: true
    }
  });

  return rows.map((team) => ({
    id: team.id,
    name: team.name,
    lead: team.lead,
    memberIds: team.members.map((member) => member.employeeId),
    routing: team.routing as Team["routing"]
  }));
}

export async function getTags(tenantId = "tenant-demo"): Promise<Tag[]> {
  await ensureSeeded();
  return prisma.tag.findMany({ where: { tenantId } });
}

export async function getTemplates(tenantId?: string): Promise<MessageTemplate[]> {
  await ensureSeeded();
  const rows = await prisma.template.findMany({ where: tenantId ? { tenantId } : undefined });

  return rows.map((template) => ({
    name: template.name,
    message: template.message,
    type: template.type as MessageTemplate["type"],
    category: template.category as MessageTemplate["category"],
    language: template.language,
    status: template.status as MessageTemplate["status"],
    headerType: template.headerType as MessageTemplate["headerType"],
    headerText: template.headerText,
    headerMedia: template.headerMedia,
    footer: template.footer,
    buttonType: template.buttonType as MessageTemplate["buttonType"],
    buttonText: template.buttonText,
    buttonPhone: template.buttonPhone,
    buttonUrl: template.buttonUrl,
    metaId: template.metaId,
    syncedAt: template.syncedAt,
    lastUsed: template.lastUsed
  }));
}

const automaticQuickReplyPrefix = "qr-auto-";
const quickReplyStopWords = new Set([
  "الى", "إلى", "على", "عن", "في", "من", "مع", "هذا", "هذه", "ذلك", "تم", "لك", "لنا", "هو", "هي", "ان", "أن", "او", "أو", "the", "and", "for", "with", "your", "you", "our", "this", "that", "are", "was"
]);

function normalizeQuickReplyText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function isSafeAutomaticReply(value: string) {
  const text = value.trim();
  if (text.length < 12 || text.length > 500) return false;
  if (/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) return false;
  if (/\d{5,}|(?:\+?\d[\s-]*){8,}/.test(text)) return false;
  return /[\p{L}]/u.test(text);
}

function automaticShortcut(text: string, hash: string) {
  const words = text.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) || [];
  const useful = words.filter((word) => word.length > 2 && !quickReplyStopWords.has(word) && !/^\d+$/.test(word));
  const base = (useful.slice(0, 2).join("-") || `رد-${hash.slice(0, 4)}`).slice(0, 28);
  return `/${base}`;
}

export async function syncAutomaticQuickReplies(tenantId: string) {
  await ensureSeeded();
  const [messages, existing] = await Promise.all([
    prisma.message.findMany({
      where: { direction: "out", conversation: { tenantId } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { text: true }
    }),
    prisma.quickReply.findMany({ where: { tenantId }, select: { text: true, shortcut: true } })
  ]);
  const existingTexts = new Set(existing.map((reply) => normalizeQuickReplyText(reply.text)));
  const shortcuts = new Set(existing.map((reply) => reply.shortcut.toLocaleLowerCase("en-US")));
  const groups = new Map<string, { text: string; count: number }>();
  for (const message of messages) {
    if (!isSafeAutomaticReply(message.text)) continue;
    const normalized = normalizeQuickReplyText(message.text);
    if (existingTexts.has(normalized)) continue;
    const current = groups.get(normalized);
    if (current) current.count += 1;
    else groups.set(normalized, { text: message.text.trim(), count: 1 });
  }
  const candidates = Array.from(groups.entries())
    .filter(([, item]) => item.count >= 3)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 6);
  for (const [normalized, item] of candidates) {
    const hash = createHash("sha256").update(`${tenantId}:${normalized}`).digest("hex").slice(0, 14);
    let shortcut = automaticShortcut(item.text, hash);
    if (shortcuts.has(shortcut.toLocaleLowerCase("en-US"))) shortcut = `${shortcut}-${hash.slice(0, 4)}`;
    shortcuts.add(shortcut.toLocaleLowerCase("en-US"));
    await prisma.quickReply.upsert({
      where: { id: `${automaticQuickReplyPrefix}${hash}` },
      update: {},
      create: { id: `${automaticQuickReplyPrefix}${hash}`, tenantId, shortcut, text: item.text, team: "", usage: item.count }
    });
  }
}

export async function getQuickReplies(tenantId = "tenant-demo"): Promise<QuickReply[]> {
  await ensureSeeded();
  const rows = await prisma.quickReply.findMany({ where: { tenantId, usage: { gte: 0 } }, orderBy: { usage: "desc" } });
  return rows.map((reply) => ({ ...reply, autoGenerated: reply.id.startsWith(automaticQuickReplyPrefix) }));
}

export async function getAutomationRules(tenantId = "tenant-demo"): Promise<AutomationRule[]> {
  await ensureSeeded();
  const rows = await prisma.automationRule.findMany({ where: { tenantId } });

  return rows.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    trigger: rule.trigger,
    action: rule.action,
    target: rule.target,
    delayMinutes: rule.delayMinutes,
    conditions: parseAutomationConditions(rule.conditionsJson),
    actions: parseAutomationActions(rule.actionsJson),
    createdAt: rule.createdAt,
    enabled: Boolean(rule.enabled)
  }));
}

export async function getCampaigns(tenantId = "tenant-demo"): Promise<Campaign[]> {
  await ensureSeeded();
  const rows = await prisma.campaign.findMany({ where: { tenantId } });

  return rows.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    sent: campaign.sent,
    total: campaign.total,
    progress: campaign.progress,
    status: campaign.status as Campaign["status"],
    updatedAt: campaign.updatedAt
  }));
}

export async function getWorkSchedules(tenantId = "tenant-demo"): Promise<WorkSchedule[]> {
  await ensureSeeded();
  const rows = await prisma.workSchedule.findMany({ where: { tenantId } });

  return rows.map((schedule) => ({
    id: schedule.id,
    team: schedule.team,
    days: schedule.days,
    start: schedule.start,
    end: schedule.end,
    status: schedule.status as WorkSchedule["status"],
    holidays: schedule.holidays as WorkSchedule["holidays"]
  }));
}

export type IntegrationChannel = "whatsapp" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "tiktok" | "sms";

export function getIntegrationBaseId(channel: IntegrationChannel) {
  if (channel === "instagram") return "meta-instagram";
  if (channel === "facebook") return "meta-facebook";
  if (channel === "telegram") return "telegram-bot";
  if (channel === "x") return "x-channel";
  if (channel === "google_maps") return "google-maps";
  if (channel === "email") return "email-channel";
  if (channel === "website") return "website-channel";
  if (channel === "tiktok") return "tiktok-channel";
  if (channel === "sms") return "sms-channel";
  return "meta-whatsapp";
}

export function getTenantIntegrationId(channel: IntegrationChannel, tenantId = "tenant-demo") {
  const baseId = getIntegrationBaseId(channel);
  return !tenantId || tenantId === "tenant-demo" ? baseId : `${tenantId}:${baseId}`;
}

export async function getIntegrationSettings(channel: IntegrationChannel = "whatsapp", tenantId = "tenant-demo"): Promise<IntegrationSettings> {
  await ensureSeeded();
  const id = getTenantIntegrationId(channel, tenantId);
  const existingSettings = await prisma.integrationSetting.findUnique({
    where: { id }
  });
  const settings = existingSettings ?? await prisma.integrationSetting.create({
    data: {
      id,
      provider: channel === "instagram"
        ? "instagram"
        : channel === "facebook"
          ? "facebook"
          : channel === "telegram"
            ? "telegram"
            : channel === "x"
              ? "x"
              : channel === "google_maps"
                ? "google_maps"
              : channel === "email"
                ? "email"
              : channel === "website"
                ? "website"
              : channel === "tiktok"
                ? "tiktok"
              : channel === "sms"
                ? "unifonic"
              : "whatsapp_cloud",
      status: channel === "website" ? "connected" : "pending",
      businessName: "",
      wabaName: "",
      phoneNumber: "",
      phoneNumberId: "",
      wabaId: "",
      appId: channel === "telegram" || channel === "x" || channel === "email" || channel === "website" || channel === "tiktok" || channel === "sms" ? "" : channel === "google_maps" ? defaultGoogleClientId : defaultMetaAppId,
      configId: "",
      verifyToken: randomUUID(),
      accessToken: "",
      webhookUrl: channel === "telegram" ? `/api/telegram/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : channel === "x" ? `/api/x/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : channel === "google_maps" ? "/api/google/reviews/sync" : channel === "email" ? "/api/email/inbound" : channel === "website" ? "/api/website/message" : channel === "tiktok" ? `/api/tiktok/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : channel === "sms" ? `/api/sms/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : "/api/meta/webhook",
      updatedAt: "اليوم"
    }
  });
  const encryptedUpdates: Record<string, string> = {};
  for (const field of integrationSecretFields) {
    if (field === "verifyToken" && settings.provider === "website") continue;
    const value = settings[field];
    if (value && !value.startsWith("enc:v1:")) encryptedUpdates[field] = encryptSecret(value);
  }
  if (Object.keys(encryptedUpdates).length) {
    await prisma.integrationSetting.update({ where: { id: settings.id }, data: encryptedUpdates });
  }
  const whatsappSettings = channel === "instagram" || channel === "facebook"
    ? await prisma.integrationSetting.findUnique({ where: { id: getTenantIntegrationId("whatsapp", tenantId) } })
    : null;
  const providerMetaSettings = tenantId !== "tenant-demo" && channel !== "telegram" && channel !== "x" && channel !== "google_maps" && channel !== "email" && channel !== "website" && channel !== "tiktok" && channel !== "sms"
    ? await prisma.integrationSetting.findUnique({ where: { id: "meta-whatsapp" } })
    : null;
  const fallbackAppId = channel === "google_maps"
    ? settings.appId || defaultGoogleClientId
    : channel === "x" || channel === "email" || channel === "website" || channel === "tiktok" || channel === "sms"
    ? settings.appId
    : channel === "instagram" || channel === "facebook"
    ? settings.appId || defaultMetaAppId || whatsappSettings?.appId || providerMetaSettings?.appId || ""
    : settings.appId || defaultMetaAppId || whatsappSettings?.appId || providerMetaSettings?.appId || "";
  const storedConfigId = decryptSecret(settings.configId);
  const fallbackConfigId = channel === "google_maps"
    ? storedConfigId || defaultGoogleClientSecret
    : channel === "telegram" || channel === "x" || channel === "email" || channel === "website" || channel === "tiktok" || channel === "sms"
      ? storedConfigId
      : storedConfigId || defaultMetaConfigId || decryptSecret(whatsappSettings?.configId) || decryptSecret(providerMetaSettings?.configId) || "";

  if (!settings.appId && fallbackAppId) {
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: { appId: fallbackAppId }
    });
  }
  if (!settings.configId && fallbackConfigId) {
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: { configId: encryptSecret(fallbackConfigId) }
    });
  }

  return {
    id: settings.id,
    provider: settings.provider as IntegrationSettings["provider"],
    status: settings.status as IntegrationSettings["status"],
    businessName: settings.businessName,
    wabaName: settings.wabaName,
    phoneNumber: settings.phoneNumber,
    phoneNumberId: settings.phoneNumberId,
    wabaId: settings.wabaId,
    appId: fallbackAppId,
    configId: fallbackConfigId,
    verifyToken: decryptSecret(settings.verifyToken),
    accessToken: decryptSecret(settings.accessToken),
    xConsumerKey: settings.xConsumerKey,
    xConsumerSecret: decryptSecret(settings.xConsumerSecret),
    xBearerToken: decryptSecret(settings.xBearerToken),
    xAccessToken: decryptSecret(settings.xAccessToken),
    xAccessTokenSecret: decryptSecret(settings.xAccessTokenSecret),
    googleAccountId: settings.googleAccountId,
    googleLocationId: settings.googleLocationId,
    googleRefreshToken: decryptSecret(settings.googleRefreshToken),
    webhookUrl: settings.webhookUrl,
    updatedAt: settings.updatedAt
  };
}

export async function resolveWebsiteTenantId(siteKey: string): Promise<string | null> {
  if (!siteKey) return null;
  const settings = await prisma.integrationSetting.findFirst({
    where: { provider: "website", verifyToken: siteKey }
  });
  if (!settings) return null;
  const baseId = getIntegrationBaseId("website");
  return settings.id === baseId ? "tenant-demo" : settings.id.slice(0, settings.id.length - baseId.length - 1);
}

export type EmailIntegrationSettings = {
  id: string;
  provider: "webhook" | "gmail";
  status: "connected" | "not_connected" | "pending";
  emailAddress: string;
  senderName: string;
  webhookSecret: string;
  updatedAt: string;
};

export async function getEmailIntegrationSettings(tenantId = "tenant-demo"): Promise<EmailIntegrationSettings> {
  await ensureSeeded();
  const tenantSettings = await prisma.emailIntegration.findUnique({ where: { id: `email:${tenantId}` } });
  const settings = tenantSettings ?? (tenantId === "tenant-demo"
    ? await prisma.emailIntegration.findUniqueOrThrow({ where: { id: "primary-email" } })
    : await prisma.emailIntegration.create({
      data: {
        id: `email:${tenantId}`,
        provider: "gmail",
        status: "not_connected",
        senderName: "",
        emailAddress: "",
        webhookSecret: encryptSecret(randomUUID()),
        updatedAt: new Date().toISOString()
      }
    }));
  const encryptedUpdates: { webhookSecret?: string; accessToken?: string; refreshToken?: string } = {};
  if (settings.webhookSecret && !settings.webhookSecret.startsWith("enc:v1:")) encryptedUpdates.webhookSecret = encryptSecret(settings.webhookSecret);
  if (settings.accessToken && !settings.accessToken.startsWith("enc:v1:")) encryptedUpdates.accessToken = encryptSecret(settings.accessToken);
  if (settings.refreshToken && !settings.refreshToken.startsWith("enc:v1:")) encryptedUpdates.refreshToken = encryptSecret(settings.refreshToken);
  if (Object.keys(encryptedUpdates).length > 0) {
    await prisma.emailIntegration.update({ where: { id: settings.id }, data: encryptedUpdates });
  }
  return {
    id: settings.id,
    provider: settings.provider as EmailIntegrationSettings["provider"],
    status: settings.status as EmailIntegrationSettings["status"],
    senderName: settings.senderName,
    emailAddress: settings.emailAddress,
    webhookSecret: decryptSecret(encryptedUpdates.webhookSecret || settings.webhookSecret),
    updatedAt: settings.updatedAt
  };
}

export async function getProviderClients(): Promise<ProviderClient[]> {
  await ensureSeeded();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      company: string;
      owner: string;
      plan: string;
      status: ProviderClient["status"];
      subscriptionStatus: ProviderClient["subscriptionStatus"];
      renewal: string;
      phone: string;
      wabaId: string;
      conversations: number;
      employees: number;
      lastActivity: string;
      createdAt: string;
    }>
  >(
    `SELECT
      id,
      company,
      owner,
      plan,
      status,
      subscription_status AS subscriptionStatus,
      renewal,
      phone,
      waba_id AS wabaId,
      conversations,
      employees,
      last_activity AS lastActivity,
      created_at AS createdAt
    FROM provider_clients
    ORDER BY created_at DESC`
  );

  return rows;
}

export async function getProviderSubscriptions(): Promise<ProviderSubscription[]> {
  await ensureSeeded();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      clientId: string;
      clientName: string;
      plan: string;
      status: ProviderSubscription["status"];
      amount: number;
      renewal: string;
      billingCycle: string;
      paymentMethod: string;
    }>
  >(
    `SELECT
      id,
      client_id AS clientId,
      client_name AS clientName,
      plan,
      status,
      amount,
      renewal,
      billing_cycle AS billingCycle,
      payment_method AS paymentMethod
    FROM provider_subscriptions
    ORDER BY renewal ASC`
  );

  return rows;
}

export async function getAdminLogs(): Promise<AdminLog[]> {
  await ensureSeeded();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      at: string;
      clientId: string;
      clientName: string;
      source: string;
      level: AdminLog["level"];
      message: string;
    }>
  >(
    `SELECT
      id,
      at,
      client_id AS clientId,
      client_name AS clientName,
      source,
      level,
      message
    FROM admin_logs
    ORDER BY id ASC`
  );

  return rows;
}

export async function getUserAccountById(id: string): Promise<UserAccount | null> {
  await ensureSeeded();
  return prisma.userAccount.findUnique({ where: { id } });
}

export async function verifyUserCredentials(email: string, password: string): Promise<Omit<UserAccount, "passwordHash"> | null> {
  await ensureSeeded();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.userAccount.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    return null;
  }
  const verification = verifyPassword(password, user.passwordHash);
  if (!verification.valid) return null;
  if (verification.needsRehash) {
    await prisma.userAccount.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) }
    });
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
}

export async function recordUserLogin(userId: string, ip: string) {
  await prisma.userAccount.update({
    where: { id: userId },
    data: { lastLoginAt: new Date().toISOString(), lastLoginIp: ip }
  }).catch(() => {
    // Login already succeeded; losing this bookkeeping write shouldn't block sign-in.
  });
}
