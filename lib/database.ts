import { prisma } from "./prisma";
import { createHash, randomUUID } from "crypto";
import { initialConversations } from "../app/dashboard/data/conversations";
import { automationRules } from "../app/dashboard/data/automations";
import { campaigns } from "../app/dashboard/data/campaigns";
import { employees } from "../app/dashboard/data/employees";
import { leads } from "../app/dashboard/data/leads";
import { quickReplies } from "../app/dashboard/data/quickReplies";
import { tags } from "../app/dashboard/data/tags";
import { teams } from "../app/dashboard/data/teams";
import { templates } from "../app/dashboard/data/templates";
import { workSchedules } from "../app/dashboard/data/workHours";
import type {
  AutomationRule,
  Campaign,
  Conversation,
  Customer,
  Employee,
  IntegrationSettings,
  Lead,
  Message,
  MessageTemplate,
  QuickReply,
  Tag,
  Team,
  WorkSchedule
} from "../app/dashboard/types";

let seedPromise: Promise<void> | null = null;
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
const legacyDemoPhoneNumbers = new Set(["+966 50 123 4567"]);
const legacyDemoPhoneNumberIds = new Set(["328992863638694"]);
const legacyDemoWabaIds = new Set(["369021316291991"]);

function cleanIntegrationValue(value?: string | null) {
  return value?.trim() ?? "";
}
const defaultLoginPassword = "AudienceW123";
const demoUserAccounts = [
  {
    id: "user-owner",
    employeeId: "emp-owner",
    name: "عبدالعزيز الكيالي",
    email: defaultLoginEmail,
    password: defaultLoginPassword,
    role: "مالك الحساب",
    tenantId: "tenant-demo"
  },
  {
    id: "user-support",
    employeeId: "emp-noura",
    name: "نورة القحطاني",
    email: "noura@audiencew.sa",
    password: "AudienceW123",
    role: "مالك الحساب",
    tenantId: "tenant-noura"
  }
];

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  tenantId: string;
  isPlatformAdmin: number;
  createdAt: string;
};

// Real AudienceW staff allowed into /admin. isPlatformAdmin defaults to 0 for
// every account (including every tenant's own "مالك الحساب"), so without this
// backfill nobody - not even platform staff - can reach the provider dashboard.
const platformAdminEmails = ["abdulaziz@audience.sa", "xcoode25@gmail.com"];

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

export function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export async function ensureSchema() {
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
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_consumer_key TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_consumer_secret TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_bearer_token TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_access_token TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS x_access_token_secret TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS google_account_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS google_location_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
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
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      messages INTEGER NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL DEFAULT 'قيد الانتظار',
      moyasar_id TEXT NOT NULL DEFAULT '',
      payment_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    )`);
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
    for (const email of platformAdminEmails) {
      await prisma.$executeRawUnsafe(`UPDATE user_accounts SET is_platform_admin = 1 WHERE email = ?`, email);
    }
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
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS subscription_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL DEFAULT 'قيد الانتظار',
      moyasar_id TEXT NOT NULL DEFAULT '',
      payment_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'قيد الانتظار'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS moyasar_id TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS payment_url TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS completed_at TEXT NOT NULL DEFAULT ''`);
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
    reply_to_author TEXT NOT NULL DEFAULT ''
  )`);
  const messageColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(messages)`);
  if (!messageColumns.some((column) => column.name === "created_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`);
  }
  if (!messageColumns.some((column) => column.name === "author")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN author TEXT NOT NULL DEFAULT ''`);
  }
  for (const columnName of ["attachment_type", "attachment_url", "attachment_name", "attachment_mime", "meta_media_id", "source_type", "source_id", "source_url", "source_label", "reply_to_message_id", "reply_to_text", "reply_to_author"]) {
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
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS campaign_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    messages INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'قيد الانتظار',
    moyasar_id TEXT NOT NULL DEFAULT '',
    payment_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT ''
  )`);
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
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    interest TEXT NOT NULL,
    budget TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL,
    employee TEXT NOT NULL,
    last_contact TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'
  )`);
  const leadColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(leads)`);
  for (const columnName of ["phone", "source", "notes"]) {
    if (!leadColumns.some((column) => column.name === columnName)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE leads ADD COLUMN ${columnName} TEXT NOT NULL DEFAULT ''`);
    }
  }
  if (!leadColumns.some((column) => column.name === "tenant_id")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-demo'`);
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
    is_platform_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  const userAccountColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(user_accounts)`);
  if (!userAccountColumns.some((column) => column.name === "is_platform_admin")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_accounts ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0`);
  }
  for (const email of platformAdminEmails) {
    await prisma.$executeRawUnsafe(`UPDATE user_accounts SET is_platform_admin = 1 WHERE email = ?`, email);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS employee_invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
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
    status TEXT NOT NULL DEFAULT 'قيد الانتظار',
    moyasar_id TEXT NOT NULL DEFAULT '',
    payment_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT ''
  )`);
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
    created_at TEXT NOT NULL
  )`);
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
        webhookSecret: process.env.EMAIL_WEBHOOK_SECRET || createHash("sha256").update("audiencew-email-webhook").digest("hex"),
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
        verifyToken: "audiencew_webhook_verify",
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
        verifyToken: "audiencew_webhook_verify",
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
        verifyToken: "audiencew_webhook_verify",
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
        verifyToken: "audiencew_telegram_secret",
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
        verifyToken: "audiencew_x_secret",
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
        verifyToken: "audiencew_google_secret",
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
        verifyToken: "audiencew_email_secret",
        accessToken: "",
        webhookUrl: "/api/email/inbound",
        updatedAt: "اليوم"
      }
    });

    for (const account of demoUserAccounts) {
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

    return;

    await tx.conversationTag.deleteMany({ where: { conversationId: { in: ["c-1", "c-2", "c-3", "c-4"] } } });
    await tx.message.deleteMany({ where: { conversationId: { in: ["c-1", "c-2", "c-3", "c-4"] } } });
    await tx.conversation.deleteMany({ where: { id: { in: ["c-1", "c-2", "c-3", "c-4"] } } });
    await tx.customer.deleteMany({ where: { id: { in: ["c-1", "c-2", "c-3", "c-4"] } } });
    await tx.tag.deleteMany({ where: { id: { in: ["tag-vip", "tag-shipping", "tag-payment", "tag-complaint", "tag-followup"] } } });
    await tx.template.deleteMany({
      where: {
        name: {
          in: [
            "welcome",
            "marketing_offer",
            "order_confirmation",
            "order_confirmation_v1",
            "jaspers_market_image_cta_v1",
            "jaspers_market_order_confirmation_v1"
          ]
        }
      }
    });
    await tx.quickReply.deleteMany({ where: { id: { in: ["qr-address", "qr-hours", "qr-payment", "qr-return"] } } });
    await tx.automationRule.deleteMany({ where: { id: { in: ["auto-hiring", "auto-complaints"] } } });
    await tx.campaign.deleteMany({ where: { id: { in: ["camp-intro-1", "camp-intro-2"] } } });
    await tx.workSchedule.deleteMany({ where: { id: { in: ["wh-support", "wh-shipping", "wh-sales"] } } });
    await tx.lead.deleteMany({ where: { id: { in: ["lead-sarah", "lead-noura", "lead-store"] } } });
    await tx.teamMember.deleteMany({ where: { teamId: { in: ["team-support", "team-shipping", "team-sales"] } } });
    await tx.team.deleteMany({ where: { id: { in: ["team-support", "team-shipping", "team-sales"] } } });
    await tx.employee.deleteMany({ where: { id: { in: ["emp-sarah", "emp-abdullah"] } } });
    await tx.$executeRawUnsafe(`DELETE FROM provider_clients WHERE id IN ('client-majidia', 'client-realty-demo', 'client-store-demo')`);
    await tx.$executeRawUnsafe(`DELETE FROM provider_subscriptions WHERE id IN ('sub-majidia', 'sub-realty-demo', 'sub-store-demo')`);
    await tx.$executeRawUnsafe(`DELETE FROM admin_logs WHERE id IN ('log-1', 'log-2', 'log-3', 'log-4')`);

      const existingIntegration = await tx.integrationSetting.findUnique({ where: { id: "meta-whatsapp" } });
      const integrationPhoneNumber = cleanIntegrationValue(existingIntegration?.phoneNumber);
      const integrationPhoneNumberId = cleanIntegrationValue(existingIntegration?.phoneNumberId);
      const integrationWabaId = cleanIntegrationValue(existingIntegration?.wabaId);
      const integrationAccessToken = cleanIntegrationValue(existingIntegration?.accessToken);
      const hasRealIntegrationData =
        Boolean(integrationAccessToken) ||
        Boolean(integrationPhoneNumber && !legacyDemoPhoneNumbers.has(integrationPhoneNumber)) ||
        Boolean(integrationPhoneNumberId && !legacyDemoPhoneNumberIds.has(integrationPhoneNumberId)) ||
        Boolean(integrationWabaId && !legacyDemoWabaIds.has(integrationWabaId));
      const hasLegacyDemoData =
        !hasRealIntegrationData &&
        (existingIntegration?.businessName === "شركة الجمهور المخصص للدعاية والإعلان" ||
          existingIntegration?.wabaName === "AudienceW WhatsApp Business Account" ||
          legacyDemoPhoneNumbers.has(integrationPhoneNumber) ||
          legacyDemoPhoneNumberIds.has(integrationPhoneNumberId) ||
          legacyDemoWabaIds.has(integrationWabaId));

    if (hasLegacyDemoData) {
      await tx.conversationTag.deleteMany({});
      await tx.message.deleteMany({});
      await tx.conversation.deleteMany({});
      await tx.customer.deleteMany({});
      await tx.tag.deleteMany({});
      await tx.template.deleteMany({});
      await tx.quickReply.deleteMany({});
      await tx.automationRule.deleteMany({});
      await tx.campaign.deleteMany({});
      await tx.workSchedule.deleteMany({});
      await tx.lead.deleteMany({});
      await tx.teamMember.deleteMany({});
      await tx.team.deleteMany({});
      await tx.employee.deleteMany({ where: { id: { notIn: ["emp-owner", "emp-noura"] } } });
      await tx.integrationSetting.update({
        where: { id: "meta-whatsapp" },
        data: {
          status: "pending",
          businessName: "",
          wabaName: "",
          phoneNumber: "",
          phoneNumberId: "",
          wabaId: "",
          accessToken: "",
          updatedAt: "اليوم"
        }
      });
      await tx.$executeRawUnsafe(`DELETE FROM provider_clients`);
      await tx.$executeRawUnsafe(`DELETE FROM provider_subscriptions`);
      await tx.$executeRawUnsafe(`DELETE FROM admin_logs`);
    }

    for (const conversation of initialConversations) {
      await tx.customer.upsert({
        where: { id: conversation.id },
        update: {},
        create: {
          id: conversation.id,
          name: conversation.customer,
          phone: conversation.phone,
          initial: conversation.initial
        }
      });

      await tx.conversation.upsert({
        where: { id: conversation.id },
        update: {},
        create: {
          id: conversation.id,
          customerId: conversation.id,
          channel: conversation.channel ?? "whatsapp",
          lastMessage: conversation.lastMessage,
          status: conversation.status,
          assignee: conversation.assignee,
          unread: conversation.unread ?? 0,
          windowExpired: conversation.windowExpired ? 1 : 0,
          lastActivityAt: conversation.lastActivityAt ?? ""
        }
      });

      for (const message of conversation.messages) {
        await tx.message.upsert({
          where: { id: message.id },
          update: {},
          create: {
            id: message.id,
            conversationId: conversation.id,
            direction: message.direction,
            text: message.text,
            time: message.time,
            author: message.author ?? "",
            attachmentType: message.attachment?.type ?? "",
            attachmentUrl: message.attachment?.url ?? "",
            attachmentName: message.attachment?.name ?? "",
            attachmentMime: "",
            metaMediaId: "",
            sourceType: "",
            sourceId: "",
            sourceUrl: "",
            sourceLabel: "",
            replyToMessageId: "",
            replyToText: "",
            replyToAuthor: ""
          }
        });
      }

      for (const tag of conversation.tags) {
        await tx.conversationTag.upsert({
          where: {
            conversationId_tagName: {
              conversationId: conversation.id,
              tagName: tag
            }
          },
          update: {},
          create: {
            conversationId: conversation.id,
            tagName: tag
          }
        });
      }
    }

    for (const employee of employees) {
      const employeeData = {
        name: employee.name,
        role: employee.role,
        status: employee.status,
        permissions: employee.permissions,
        email: employee.email,
        initial: employee.initial,
        tenantId: employee.email === "noura@audiencew.sa" ? "tenant-noura" : "tenant-demo"
      };

      await tx.employee.upsert({
        where: { id: employee.id },
        update: employeeData,
        create: {
          id: employee.id,
          ...employeeData
        }
      });
    }

    for (const team of teams) {
      await tx.team.upsert({
        where: { id: team.id },
        update: {},
        create: {
          id: team.id,
          name: team.name,
          lead: team.lead,
          routing: team.routing
        }
      });

      for (const memberId of team.memberIds) {
        await tx.teamMember.upsert({
          where: {
            teamId_employeeId: {
              teamId: team.id,
              employeeId: memberId
            }
          },
          update: {},
          create: {
            teamId: team.id,
            employeeId: memberId
          }
        });
      }
    }

    for (const tag of tags) {
      await tx.tag.upsert({
        where: { id: tag.id },
        update: {},
        create: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          description: tag.description
        }
      });
    }

    for (const template of templates) {
      await tx.template.upsert({
        where: { name_tenantId: { name: template.name, tenantId: "tenant-demo" } },
        update: {},
        create: {
          id: `tmpl-tenant-demo-${template.name}`,
          tenantId: "tenant-demo",
          name: template.name,
          message: template.message,
          type: template.type ?? "خدمة",
          category: template.category ?? (template.type === "تسويق" ? "MARKETING" : "UTILITY"),
          language: template.language ?? "ar",
          status: template.status ?? "معتمد",
          headerType: template.headerType ?? "NONE",
          headerText: template.headerText ?? "",
          headerMedia: template.headerMedia ?? "",
          footer: template.footer ?? "",
          buttonType: template.buttonType ?? "NONE",
          buttonText: template.buttonText ?? "",
          buttonPhone: template.buttonPhone ?? "",
          buttonUrl: template.buttonUrl ?? "",
          metaId: template.metaId ?? "",
          syncedAt: template.syncedAt ?? "-",
          lastUsed: template.lastUsed ?? "-"
        }
      });
    }

    for (const reply of quickReplies) {
      await tx.quickReply.upsert({
        where: { id: reply.id },
        update: {},
        create: reply
      });
    }

    for (const rule of automationRules) {
      await tx.automationRule.upsert({
        where: { id: rule.id },
        update: {},
        create: {
          id: rule.id,
          name: rule.name,
          description: rule.description,
          trigger: rule.trigger,
          action: rule.action,
          target: rule.target,
          delayMinutes: rule.delayMinutes,
          conditionsJson: JSON.stringify(rule.conditions),
          actionsJson: JSON.stringify(rule.actions),
          createdAt: rule.createdAt,
          enabled: rule.enabled ? 1 : 0
        }
      });
    }

    for (const campaign of campaigns) {
      await tx.campaign.upsert({
        where: { id: campaign.id },
        update: {},
        create: campaign
      });
    }

    for (const schedule of workSchedules) {
      await tx.workSchedule.upsert({
        where: { id: schedule.id },
        update: {},
        create: schedule
      });
    }

    for (const lead of leads) {
      await tx.lead.upsert({
        where: { id: lead.id },
        update: {},
        create: {
          id: lead.id,
          customer: lead.customer,
          phone: lead.phone || "",
          interest: lead.interest,
          budget: lead.budget,
          source: lead.source || "",
          notes: lead.notes || "",
          stage: lead.stage,
          employee: lead.employee,
          lastContact: lead.lastContact,
          tenantId: lead.tenantId || "tenant-demo"
        }
      });
    }

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
        verifyToken: "audiencew_webhook_verify",
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
        verifyToken: "audiencew_webhook_verify",
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
        verifyToken: "audiencew_webhook_verify",
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
        verifyToken: "audiencew_telegram_secret",
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
        verifyToken: "audiencew_x_secret",
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
        verifyToken: "audiencew_google_secret",
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
        verifyToken: "audiencew_email_secret",
        accessToken: "",
        webhookUrl: "/api/email/inbound",
        updatedAt: "اليوم"
      }
    });

    for (const account of demoUserAccounts) {
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

    const providerClients: ProviderClient[] = [];

    for (const client of providerClients) {
      await tx.$executeRawUnsafe(
        `INSERT INTO provider_clients (
          id, company, owner, plan, status, subscription_status, renewal, phone, waba_id,
          conversations, employees, last_activity, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
        client.id,
        client.company,
        client.owner,
        client.plan,
        client.status,
        client.subscriptionStatus,
        client.renewal,
        client.phone,
        client.wabaId,
        client.conversations,
        client.employees,
        client.lastActivity,
        client.createdAt
      );
    }

    const providerSubscriptions: ProviderSubscription[] = [];

    for (const subscription of providerSubscriptions) {
      await tx.$executeRawUnsafe(
        `INSERT INTO provider_subscriptions (
          id, client_id, client_name, plan, status, amount, renewal, billing_cycle, payment_method
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
        subscription.id,
        subscription.clientId,
        subscription.clientName,
        subscription.plan,
        subscription.status,
        subscription.amount,
        subscription.renewal,
        subscription.billingCycle,
        subscription.paymentMethod
      );
    }

    const adminLogs: AdminLog[] = [];

    for (const log of adminLogs) {
      await tx.$executeRawUnsafe(
        `INSERT INTO admin_logs (id, at, client_id, client_name, source, level, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        log.id,
        log.at,
        log.clientId,
        log.clientName,
        log.source,
        log.level,
        log.message
      );
    }
  });
}

async function ensureSeeded() {
  seedPromise ??= seedDatabase();
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

export async function getConversations(tenantId = "tenant-demo"): Promise<Conversation[]> {
  await ensureSeeded();
  const conversations = await prisma.conversation.findMany({
    where: { tenantId },
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
      } : undefined
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
  const rows = await prisma.employee.findMany({ where: { tenantId } });

  return rows.map((employee) => ({
    id: employee.id,
    name: employee.name,
    role: employee.role as Employee["role"],
    status: employee.status as Employee["status"],
    permissions: employee.permissions,
    email: employee.email,
    initial: employee.initial
  }));
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

export async function getQuickReplies(tenantId = "tenant-demo"): Promise<QuickReply[]> {
  await ensureSeeded();
  return prisma.quickReply.findMany({ where: { tenantId } });
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

export async function getLeads(tenantId = "tenant-demo"): Promise<Lead[]> {
  await ensureSeeded();
  return prisma.lead.findMany({ where: { tenantId } });
}

export type IntegrationChannel = "whatsapp" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "tiktok" | "sms" | "leads";

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
  if (channel === "leads") return "leads-zapier";
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
              : channel === "leads"
                ? "leads"
              : "whatsapp_cloud",
      status: channel === "website" || channel === "leads" ? "connected" : "pending",
      businessName: "",
      wabaName: "",
      phoneNumber: "",
      phoneNumberId: "",
      wabaId: "",
      appId: channel === "telegram" || channel === "x" || channel === "email" || channel === "website" || channel === "tiktok" || channel === "sms" || channel === "leads" ? "" : channel === "google_maps" ? defaultGoogleClientId : defaultMetaAppId,
      configId: "",
      verifyToken: channel === "telegram" || channel === "x" ? randomUUID() : channel === "google_maps" ? "audiencew_google_secret" : channel === "email" ? "audiencew_email_secret" : channel === "website" || channel === "tiktok" || channel === "sms" || channel === "leads" ? randomUUID() : "audiencew_webhook_verify",
      accessToken: "",
      webhookUrl: channel === "telegram" ? `/api/telegram/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : channel === "x" ? `/api/x/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : channel === "google_maps" ? "/api/google/reviews/sync" : channel === "email" ? "/api/email/inbound" : channel === "website" ? "/api/website/message" : channel === "tiktok" ? `/api/tiktok/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : channel === "sms" ? `/api/sms/webhook${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : channel === "leads" ? `/api/zapier/leads${tenantId && tenantId !== "tenant-demo" ? `?tenant=${tenantId}` : ""}` : "/api/meta/webhook",
      updatedAt: "اليوم"
    }
  });
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
  const fallbackConfigId = channel === "google_maps"
    ? settings.configId || defaultGoogleClientSecret
    : channel === "telegram" || channel === "x" || channel === "email" || channel === "website" || channel === "tiktok" || channel === "sms"
      ? settings.configId
      : settings.configId || defaultMetaConfigId || whatsappSettings?.configId || providerMetaSettings?.configId || "";

  if (!settings.appId && fallbackAppId) {
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: { appId: fallbackAppId }
    });
  }
  if (!settings.configId && fallbackConfigId) {
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: { configId: fallbackConfigId }
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
    verifyToken: settings.verifyToken,
    accessToken: settings.accessToken,
    xConsumerKey: settings.xConsumerKey,
    xConsumerSecret: settings.xConsumerSecret,
    xBearerToken: settings.xBearerToken,
    xAccessToken: settings.xAccessToken,
    xAccessTokenSecret: settings.xAccessTokenSecret,
    googleAccountId: settings.googleAccountId,
    googleLocationId: settings.googleLocationId,
    googleRefreshToken: settings.googleRefreshToken,
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
  provider: "webhook" | "gmail" | "outlook";
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
        webhookSecret: createHash("sha256").update(`audiencew-email-${tenantId}-${Date.now()}`).digest("hex"),
        updatedAt: new Date().toISOString()
      }
    }));
  return {
    id: settings.id,
    provider: settings.provider as EmailIntegrationSettings["provider"],
    status: settings.status as EmailIntegrationSettings["status"],
    senderName: settings.senderName,
    emailAddress: settings.emailAddress,
    webhookSecret: settings.webhookSecret,
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

  if (!user || user.passwordHash !== hashPassword(password)) {
    return null;
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
