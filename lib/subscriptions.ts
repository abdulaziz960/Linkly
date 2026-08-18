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
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh"
  }).format(new Date());
}

export async function getSubscriptions() {
  await ensureSchema();
  const subscriptions = await prisma.subscription.findMany({ orderBy: { createdAt: "desc" } });

  return Promise.all(
    subscriptions.map(async (subscription) => {
      const [employeeCount, conversationCount] = await Promise.all([
        prisma.employee.count({ where: { tenantId: subscription.tenantId } }),
        prisma.conversation.count({ where: { tenantId: subscription.tenantId } })
      ]);

      return { ...subscription, employeeCount, conversationCount };
    })
  );
}

export async function getSubscriptionForTenant(tenantId: string) {
  await ensureSchema();
  return prisma.subscription.findUnique({ where: { tenantId } });
}

export async function getSubscriptionPayments() {
  await ensureSchema();
  const [payments, subscriptions] = await Promise.all([
    prisma.subscriptionPayment.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.subscription.findMany({ select: { tenantId: true, companyName: true } })
  ]);

  const companyNameByTenant = new Map(subscriptions.map((s) => [s.tenantId, s.companyName]));

  return payments.map((payment) => ({
    ...payment,
    companyName: companyNameByTenant.get(payment.tenantId) || payment.tenantId
  }));
}

export async function logAdminAction(tenantId: string, clientName: string, message: string, level: "معلومة" | "تنبيه" | "خطأ" = "معلومة") {
  await prisma.adminLog.create({
    data: {
      id: `log-${Date.now()}-${randomUUID().slice(0, 6)}`,
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
  const employeeId = `emp-${Date.now()}`;
  const userId = `user-${employeeId}`;
  const employeeLimit = planEmployeeLimits[input.plan] ?? planEmployeeLimits["باقة النمو"];
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
        id: `invite-${Date.now()}`,
        email,
        tokenHash,
        expiresAt,
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
        id: `log-${Date.now()}`,
        at: now,
        clientId: tenantId,
        clientName: input.companyName,
        source: "لوحة الأدمن",
        level: "معلومة",
        message: `تم إنشاء حساب جديد لعميل "${input.companyName}" بواسطة ${input.adminName}.`
      }
    });
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
