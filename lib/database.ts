import { prisma } from "./prisma";
import { createHash } from "crypto";
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
const isPostgresDatabase =
  process.env.DATABASE_URL?.startsWith("postgres://") || process.env.DATABASE_URL?.startsWith("postgresql://");
const defaultLoginEmail = "admin@audiencew.sa";
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
    name: "عبدالعزيز الكيالي",
    email: defaultLoginEmail,
    password: defaultLoginPassword,
    role: "مالك الحساب"
  },
  {
    id: "user-support",
    name: "نورة القحطاني",
    email: "noura@audiencew.sa",
    password: "AudienceW123",
    role: "موظف دعم"
  }
];

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  tenantId: string;
  createdAt: string;
};

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

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

async function ensureSchema() {
  if (isPostgresDatabase) return;

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    initial TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    last_message TEXT NOT NULL,
    status TEXT NOT NULL,
    assignee TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 0,
    window_expired INTEGER NOT NULL DEFAULT 0,
    last_activity_at TEXT NOT NULL DEFAULT ''
  )`);
  const conversationColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(conversations)`);
  if (!conversationColumns.some((column) => column.name === "last_activity_at")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE conversations ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT ''`);
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
    meta_media_id TEXT NOT NULL DEFAULT ''
  )`);
  const messageColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(messages)`);
  if (!messageColumns.some((column) => column.name === "author")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN author TEXT NOT NULL DEFAULT ''`);
  }
  for (const columnName of ["attachment_type", "attachment_url", "attachment_name", "attachment_mime", "meta_media_id"]) {
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
    initial TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lead TEXT NOT NULL,
    routing TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    PRIMARY KEY (team_id, employee_id)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    description TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    PRIMARY KEY (conversation_id, tag_name)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS templates (
    name TEXT PRIMARY KEY,
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
    last_used TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS quick_replies (
    id TEXT PRIMARY KEY,
    shortcut TEXT NOT NULL,
    text TEXT NOT NULL,
    team TEXT NOT NULL,
    usage INTEGER NOT NULL DEFAULT 0
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
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
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS work_schedules (
    id TEXT PRIMARY KEY,
    team TEXT NOT NULL,
    days TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    status TEXT NOT NULL,
    holidays TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    interest TEXT NOT NULL,
    budget TEXT NOT NULL,
    stage TEXT NOT NULL,
    employee TEXT NOT NULL,
    last_contact TEXT NOT NULL
  )`);
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
    webhook_url TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS user_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-demo',
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
}

async function seedDatabase() {
  await ensureSchema();
  await prisma.$transaction(async (tx) => {
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

    for (const account of demoUserAccounts) {
      await tx.userAccount.upsert({
        where: { email: account.email },
        update: {},
        create: {
          id: account.id,
          name: account.name,
          email: account.email,
          passwordHash: hashPassword(account.password),
          role: account.role,
          tenantId: "tenant-demo",
          createdAt: "اليوم"
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
            metaMediaId: ""
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
        initial: employee.initial
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
        where: { name: template.name },
        update: {},
        create: {
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
          ...rule,
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
          interest: lead.interest,
          budget: lead.budget,
          stage: lead.stage,
          employee: lead.employee,
          lastContact: lead.lastContact
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

    for (const account of demoUserAccounts) {
      await tx.userAccount.upsert({
        where: { email: account.email },
        update: {},
        create: {
          id: account.id,
          name: account.name,
          email: account.email,
          passwordHash: hashPassword(account.password),
          role: account.role,
          tenantId: "tenant-demo",
          createdAt: "اليوم"
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

export async function getCustomers(): Promise<Customer[]> {
  await ensureSeeded();
  const customers = await prisma.customer.findMany({
    include: {
      conversations: {
        include: {
          tags: true
        }
      }
    }
  });

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    initial: customer.initial,
    tags: Array.from(new Set(customer.conversations.flatMap((conversation) => conversation.tags.map((tag) => tag.tagName))))
  }));
}

export async function getConversations(): Promise<Conversation[]> {
  await ensureSeeded();
  const conversations = await prisma.conversation.findMany({
    orderBy: {
      lastActivityAt: "desc"
    },
    include: {
      customer: true,
      messages: true,
      tags: true
    }
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    customer: conversation.customer.name,
    phone: conversation.customer.phone,
    initial: conversation.customer.initial,
    lastMessage: conversation.lastMessage,
    status: conversation.status as Conversation["status"],
    assignee: conversation.assignee,
    unread: conversation.unread || undefined,
    windowExpired: Boolean(conversation.windowExpired) || undefined,
    lastActivityAt: conversation.lastActivityAt || undefined,
    tags: conversation.tags.map((tag) => tag.tagName),
    messages: conversation.messages.map<Message>((message) => ({
      id: message.id,
      direction: message.direction as Message["direction"],
      text: message.text,
      time: message.time,
      author: message.author || undefined,
      attachment: message.attachmentType && message.attachmentUrl ? {
        type: message.attachmentType as NonNullable<Message["attachment"]>["type"],
        url: message.attachmentUrl,
        name: message.attachmentName || message.text,
        mimeType: message.attachmentMime || undefined
      } : undefined
    }))
  }));
}

export async function getEmployees(): Promise<Employee[]> {
  await ensureSeeded();
  const rows = await prisma.employee.findMany();

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

export async function getTeams(): Promise<Team[]> {
  await ensureSeeded();
  const rows = await prisma.team.findMany({
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

export async function getTags(): Promise<Tag[]> {
  await ensureSeeded();
  return prisma.tag.findMany();
}

export async function getTemplates(): Promise<MessageTemplate[]> {
  await ensureSeeded();
  const rows = await prisma.template.findMany();

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

export async function getQuickReplies(): Promise<QuickReply[]> {
  await ensureSeeded();
  return prisma.quickReply.findMany();
}

export async function getAutomationRules(): Promise<AutomationRule[]> {
  await ensureSeeded();
  const rows = await prisma.automationRule.findMany();

  return rows.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    createdAt: rule.createdAt,
    enabled: Boolean(rule.enabled)
  }));
}

export async function getCampaigns(): Promise<Campaign[]> {
  await ensureSeeded();
  const rows = await prisma.campaign.findMany();

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

export async function getWorkSchedules(): Promise<WorkSchedule[]> {
  await ensureSeeded();
  const rows = await prisma.workSchedule.findMany();

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

export async function getLeads(): Promise<Lead[]> {
  await ensureSeeded();
  return prisma.lead.findMany();
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  await ensureSeeded();
  const settings = await prisma.integrationSetting.findUniqueOrThrow({
    where: { id: "meta-whatsapp" }
  });

  if (!settings.appId && defaultMetaAppId) {
    await prisma.integrationSetting.update({
      where: { id: settings.id },
      data: { appId: defaultMetaAppId }
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
    appId: settings.appId || defaultMetaAppId,
    configId: settings.configId,
    verifyToken: settings.verifyToken,
    accessToken: settings.accessToken,
    webhookUrl: settings.webhookUrl,
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
