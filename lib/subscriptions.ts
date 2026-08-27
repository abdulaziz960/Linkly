import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { sendActivationEmail } from "./email";

export const planEmployeeLimits: Record<string, number> = {
  "باقة البداية": 1,
  "باقة النمو": 3,
  "باقة الأعمال": 10
};

function nowTimestamp() {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(new Date());
}

export async function getSubscriptions() {
  await ensureSchema();
  const [subscriptions, employeeCounts, conversationCounts, campaignBalances] = await Promise.all([
    prisma.subscription.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.employee.groupBy({ by: ["tenantId"], _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ["tenantId"], _count: { _all: true } }),
    prisma.campaignBalance.findMany({ select: { tenantId: true, balance: true } })
  ]);
  const employeesByTenant = new Map(employeeCounts.map((row) => [row.tenantId, row._count._all]));
  const conversationsByTenant = new Map(conversationCounts.map((row) => [row.tenantId, row._count._all]));
  const campaignBalanceByTenant = new Map(campaignBalances.map((row) => [row.tenantId, row.balance]));
  return subscriptions.map((subscription) => ({
    ...subscription,
    employeeCount: employeesByTenant.get(subscription.tenantId) ?? 0,
    conversationCount: conversationsByTenant.get(subscription.tenantId) ?? 0,
    campaignBalance: campaignBalanceByTenant.get(subscription.tenantId) ?? 0
  }));
}

export async function getSubscriptionForTenant(tenantId: string) {
  await ensureSchema();
  return prisma.subscription.findUnique({ where: { tenantId } });
}

export async function getSubscriptionPayments() {
  await ensureSchema();
  const [payments, campaignPayments, subscriptions] = await Promise.all([
    prisma.subscriptionPayment.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.campaignPayment.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.subscription.findMany({ select: { tenantId: true, companyName: true } })
  ]);

  const companyNameByTenant = new Map(subscriptions.map((s) => [s.tenantId, s.companyName]));

  const subscriptionRows = payments.map((payment) => ({
    ...payment,
    companyName: companyNameByTenant.get(payment.tenantId) || payment.tenantId,
    source: "اشتراك" as const,
    messages: 0
  }));

  const campaignRows = campaignPayments.map((payment) => ({
    ...payment,
    companyName: companyNameByTenant.get(payment.tenantId) || payment.tenantId,
    source: "شحن رسائل حملات" as const
  }));

  return [...subscriptionRows, ...campaignRows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/**
 * Marks a subscription payment as completed and applies its staged plan to
 * the tenant's live subscription - the ONLY place upgraded benefits
 * (plan name, employee limit) get written. Called from both the real
 * Moyasar webhook and the dev-only test-mode confirm route so they can't
 * drift apart. Idempotent: a second call for an already-completed payment
 * is a no-op (returns activated: false) via a compare-and-swap update, so
 * a redelivered webhook or a double confirm click can't double-renew.
 */
export async function applyConfirmedSubscriptionPayment(paymentId: string): Promise<{ activated: boolean }> {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { activated: false };

  const renewalAt = new Date();
  renewalAt.setMonth(renewalAt.getMonth() + 1);

  const activated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, status: { not: "مكتمل" } },
      data: { status: "مكتمل", completedAt: new Date().toISOString() }
    });
    if (claimed.count !== 1) return false;

    await tx.subscription.update({
      where: { tenantId: payment.tenantId },
      data: {
        status: "نشط",
        renewalAt: renewalAt.toISOString().slice(0, 10),
        updatedAt: nowTimestamp(),
        // Only overwrite plan/employeeLimit if this payment actually staged
        // an upgrade (planName non-empty) - a plain renewal payment leaves
        // the current plan as-is.
        ...(payment.planName ? { plan: payment.planName, employeeLimit: payment.planEmployeeLimit } : {})
      }
    });
    return true;
  });

  return { activated };
}

export async function logAdminAction(tenantId: string, clientName: string, message: string, level: "معلومة" | "تنبيه" | "خطأ" = "معلومة") {
  await prisma.adminLog.create({
    data: {
      id: `log-${randomUUID()}`,
      at: nowTimestamp(),
      clientId: tenantId,
      clientName,
      source: "لوحة الأدمن",
      level,
      message
    }
  });
}

type CreateTenantInput = {
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
  status: string;
  amount: number;
  billingCycle: string;
  renewalAt: string;
  adminName: string;
};

/**
 * Real onboarding: creates an actual tenant, a real login account (via the
 * same activation-link flow used for inviting employees), and a
 * subscription record. This is the thing the old admin panel never did -
 * it only wrote to a disconnected demo table.
 */
export async function createTenantWithSubscription(input: CreateTenantInput) {
  await ensureSchema();
  const email = input.ownerEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("صيغة البريد الإلكتروني غير صحيحة");

  const existingAccount = await prisma.userAccount.findUnique({ where: { email } });
  if (existingAccount) throw new Error("هذا البريد الإلكتروني مستخدم بالفعل لحساب آخر على المنصة");

  const tenantId = `tenant-${randomUUID()}`;
  const employeeId = `emp-${randomUUID()}`;
  const userId = `user-${employeeId}`;
  const planRow = await prisma.plan.findUnique({ where: { name: input.plan } });
  const employeeLimit = planRow?.employeeLimit ?? planEmployeeLimits[input.plan] ?? planEmployeeLimits["باقة النمو"];
  const activationToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(activationToken).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString();
  const now = nowTimestamp();

  await prisma.$transaction(async (tx) => {
    await tx.userAccount.create({
      data: {
        id: userId,
        name: input.ownerName,
        email,
        passwordHash: "",
        role: "مالك الحساب",
        tenantId,
        createdAt: now
      }
    });

    await tx.employee.create({
      data: {
        id: employeeId,
        name: input.ownerName,
        email,
        role: "مالك الحساب",
        status: "غير متصل",
        permissions: "الكل",
        initial: input.ownerName.slice(0, 1) || "ع",
        tenantId
      }
    });

    await tx.employeeInvite.create({
      data: {
        id: `invite-${randomUUID()}`,
        email,
        tokenHash,
        expiresAt,
        purpose: "employee_activation",
        createdAt: new Date().toISOString()
      }
    });

    await tx.subscription.create({
      data: {
        id: `sub-${tenantId}`,
        tenantId,
        companyName: input.companyName,
        ownerName: input.ownerName,
        ownerEmail: email,
        plan: input.plan,
        status: input.status,
        employeeLimit,
        amount: input.amount,
        billingCycle: input.billingCycle,
        renewalAt: input.renewalAt,
        createdAt: now,
        updatedAt: now
      }
    });

    await tx.adminLog.create({
      data: {
        id: `log-${randomUUID()}`,
        at: now,
        clientId: tenantId,
        clientName: input.companyName,
        source: "لوحة الأدمن",
        level: "معلومة",
        message: `تم إنشاء حساب جديد لعميل "${input.companyName}" بواسطة ${input.adminName}.`
      }
    });
  });

  const origin = process.env.NODE_ENV === "production"
    ? "https://audiencew.audience.sa"
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const activationUrl = `${origin.replace(/\/$/, "")}/activate?token=${activationToken}`;
  const inviteDelivery = await sendActivationEmail({ to: email, name: input.ownerName, activationUrl });

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  return { subscription, inviteDelivery };
}

type UpdateSubscriptionInput = {
  plan?: string;
  status?: string;
  employeeLimit?: number;
  amount?: number;
  billingCycle?: string;
  renewalAt?: string;
};

export async function updateSubscription(tenantId: string, input: UpdateSubscriptionInput, adminName: string) {
  await ensureSchema();
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!existing) throw new Error("الاشتراك غير موجود");

  const updated = await prisma.subscription.update({
    where: { tenantId },
    data: {
      plan: input.plan ?? existing.plan,
      status: input.status ?? existing.status,
      employeeLimit: input.employeeLimit ?? existing.employeeLimit,
      amount: input.amount ?? existing.amount,
      billingCycle: input.billingCycle ?? existing.billingCycle,
      renewalAt: input.renewalAt ?? existing.renewalAt,
      updatedAt: nowTimestamp()
    }
  });

  const changes: string[] = [];
  if (input.employeeLimit !== undefined && input.employeeLimit !== existing.employeeLimit) {
    changes.push(`حد المستخدمين من ${existing.employeeLimit} إلى ${input.employeeLimit}`);
  }
  if (input.status !== undefined && input.status !== existing.status) {
    changes.push(`حالة الاشتراك من ${existing.status} إلى ${input.status}`);
  }
  if (input.plan !== undefined && input.plan !== existing.plan) {
    changes.push(`الباقة من ${existing.plan} إلى ${input.plan}`);
  }
  await logAdminAction(
    tenantId,
    existing.companyName,
    changes.length ? `تعديل ${changes.join("، ")} بواسطة ${adminName}.` : `تحديث بيانات الاشتراك بواسطة ${adminName}.`
  );

  return updated;
}

/**
 * Permanently deletes every piece of data belonging to a tenant: their
 * subscription, login accounts, employees, teams, conversations/messages,
 * customers, campaigns, templates, quick replies, automations, bot config,
 * connected-channel settings, work schedules, tags, pending invites,
 * payment history, and activity log. Used for removing test/mistaken
 * accounts - there is no undo.
 */
export async function deleteTenant(tenantId: string) {
  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) throw new Error("الاشتراك غير موجود");

  const employees = await prisma.employee.findMany({ where: { tenantId }, select: { email: true } });
  const employeeEmails = Array.from(new Set([subscription.ownerEmail, ...employees.map((employee) => employee.email)]));
  const integrationIdPrefix = `${tenantId}:`;

  await prisma.$transaction([
    // Conversations/customers - children before parents.
    prisma.message.deleteMany({ where: { conversation: { tenantId } } }),
    prisma.conversationTag.deleteMany({ where: { conversation: { tenantId } } }),
    prisma.conversation.deleteMany({ where: { tenantId } }),
    prisma.customer.deleteMany({ where: { tenantId } }),
    // Campaigns.
    prisma.campaignRecipient.deleteMany({ where: { tenantId } }),
    prisma.campaignPayment.deleteMany({ where: { tenantId } }),
    prisma.campaignBalance.deleteMany({ where: { tenantId } }),
    prisma.campaign.deleteMany({ where: { tenantId } }),
    // Tags, templates, quick replies.
    prisma.tag.deleteMany({ where: { tenantId } }),
    prisma.template.deleteMany({ where: { tenantId } }),
    prisma.quickReply.deleteMany({ where: { tenantId } }),
    // Automations and bot config.
    prisma.automationQueueItem.deleteMany({ where: { tenantId } }),
    prisma.automationRule.deleteMany({ where: { tenantId } }),
    prisma.botNode.deleteMany({ where: { tenantId } }),
    prisma.botSettings.deleteMany({ where: { tenantId } }),
    // Work hours and connected-channel settings (no tenantId column - these
    // use "<tenantId>:<provider>" composite ids, see getTenantIntegrationId).
    prisma.workSchedule.deleteMany({ where: { tenantId } }),
    prisma.integrationSetting.deleteMany({ where: { id: { startsWith: integrationIdPrefix } } }),
    prisma.emailIntegration.deleteMany({ where: { id: { startsWith: integrationIdPrefix } } }),
    // Teams - members before the team/employee rows they reference.
    prisma.teamMember.deleteMany({ where: { team: { tenantId } } }),
    prisma.team.deleteMany({ where: { tenantId } }),
    // People and billing history last.
    prisma.subscriptionPayment.deleteMany({ where: { tenantId } }),
    prisma.adminLog.deleteMany({ where: { clientId: tenantId } }),
    prisma.employeeInvite.deleteMany({ where: { email: { in: employeeEmails } } }),
    prisma.employee.deleteMany({ where: { tenantId } }),
    prisma.userAccount.deleteMany({ where: { tenantId } }),
    prisma.subscription.delete({ where: { tenantId } })
  ]);

  return { companyName: subscription.companyName };
}
