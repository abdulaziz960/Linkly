import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { sendActivationEmail } from "./email";
import { isValidEmail } from "./validation";
import { PAYMENT_STATUS, PAYMENT_GATEWAY, mapMoyasarInvoiceStatus, type PaymentKind } from "./payment-status";
import { chargeSavedCard, buildPaymentMetadata, paymentDescription, summarizeMoyasarPayment, type GatewayPaymentDetails } from "./moyasar";

/** Length of one paid subscription period. Every plan bills monthly today. */
export const SUBSCRIPTION_PERIOD_MONTHS = 1;

function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  // Clamp "Jan 31 + 1 month" to the last day of February instead of
  // overflowing into March.
  if (next.getUTCDate() !== day) next.setUTCDate(0);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Denominator days used for a prorated-upgrade credit - see computeProrationCredit. */
const PRORATION_PERIOD_DAYS = 30;

/**
 * Credit for the unused days of the CURRENT plan when the owner switches
 * plans mid-cycle, subtracted from the new plan's list price:
 *   credit = currentPlanAmount / 30 * remainingDays
 *   finalAmount = max(0, newPlanPrice - credit)
 * Only applies to an active ("نشط"), still-paid-up subscription changing to
 * a DIFFERENT plan - a trial converting, a suspended account reactivating,
 * an overdue renewal, or a same-plan renewal all pay the full list price
 * (see computeSubscriptionPeriod, which decides period length separately).
 */
export function computeProrationCredit(input: {
  now: Date;
  currentStatus?: string;
  currentPlan?: string;
  currentAmount?: number;
  currentRenewalAt?: string;
  newPlanName: string;
  newPlanPrice: number;
}) {
  const currentPaidThrough = input.currentRenewalAt ? new Date(input.currentRenewalAt) : null;
  // Only an upgrade (strictly higher list price) is prorated - a downgrade
  // already takes effect immediately at the lower plan's full price with no
  // credit, matching the pre-existing "plan change takes effect immediately"
  // behavior for that case (see the downgrade employee-limit check in
  // app/api/billing/checkout/route.ts, which runs regardless of proration).
  const isUpgrade = Boolean(input.currentPlan) && input.currentPlan !== input.newPlanName && Boolean(input.currentAmount) && input.newPlanPrice > (input.currentAmount ?? 0);
  const stillPaidUp = input.currentStatus === "نشط" && currentPaidThrough !== null && Number.isFinite(currentPaidThrough.getTime()) && currentPaidThrough.getTime() > input.now.getTime();

  if (!isUpgrade || !stillPaidUp || !currentPaidThrough || !input.currentAmount) {
    return { creditAmount: 0, finalAmount: input.newPlanPrice, remainingDays: 0 };
  }

  const remainingDays = (currentPaidThrough.getTime() - input.now.getTime()) / 86_400_000;
  const rawCredit = (input.currentAmount / PRORATION_PERIOD_DAYS) * remainingDays;
  const creditAmount = Math.round(Math.min(rawCredit, input.newPlanPrice) * 100) / 100;
  const finalAmount = Math.round((input.newPlanPrice - creditAmount) * 100) / 100;
  return { creditAmount, finalAmount, remainingDays: Math.round(remainingDays * 10) / 10 };
}

/**
 * Decides the period a confirmed subscription payment buys.
 *
 * - Renewal of the SAME plan on an active subscription that is still paid
 *   up: the new period starts where the current one ends, so paying a week
 *   early never costs the customer that week.
 * - Anything else (trial converting, suspended account reactivating, an
 *   overdue renewal, or a plan change): the period starts now. The amount
 *   charged for a plan change is prorated separately (computeProrationCredit)
 *   even though the period itself always starts fresh from today.
 */
export function computeSubscriptionPeriod(input: {
  now: Date;
  currentStatus?: string;
  currentPlan?: string;
  currentRenewalAt?: string;
  stagedPlanName?: string;
}) {
  const currentPaidThrough = input.currentRenewalAt ? new Date(input.currentRenewalAt) : null;
  const samePlan = !input.stagedPlanName || input.stagedPlanName === input.currentPlan;
  const stillPaidUp = input.currentStatus === "نشط" && currentPaidThrough !== null && Number.isFinite(currentPaidThrough.getTime()) && currentPaidThrough.getTime() > input.now.getTime();
  const periodStart = samePlan && stillPaidUp && currentPaidThrough ? currentPaidThrough : input.now;
  const periodEnd = addMonths(periodStart, SUBSCRIPTION_PERIOD_MONTHS);
  return { periodStart: isoDate(periodStart), periodEnd: isoDate(periodEnd), extendedFromCurrent: periodStart !== input.now };
}

function gatewayColumns(details?: GatewayPaymentDetails) {
  return {
    ...(details?.gateway ? { gateway: details.gateway } : {}),
    ...(details?.gatewayStatus !== undefined ? { gatewayStatus: details.gatewayStatus } : {}),
    ...(details?.gatewayPaymentId !== undefined ? { gatewayPaymentId: details.gatewayPaymentId } : {}),
    ...(details?.paymentMethod !== undefined ? { paymentMethod: details.paymentMethod } : {}),
    ...(details?.failureReason !== undefined ? { failureReason: details.failureReason } : {})
  };
}

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

/**
 * Every caller of this (app/dashboard/page.tsx, app/billing/page.tsx, ...)
 * ends up handing the result to a Client Component prop, which Next.js
 * serializes into the page's payload - so savedCardToken, a live token
 * capable of charging the card with no cardholder present, must never be
 * part of what this returns. Callers that need the raw token (auto-renew
 * charging, disabling it) read it via a direct prisma.subscription call
 * instead, not this function.
 */
export async function getSubscriptionForTenant(tenantId: string) {
  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return null;
  const { savedCardToken: _savedCardToken, ...safeSubscription } = subscription;
  return safeSubscription;
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

export async function getInvoicesForTenant(tenantId: string) {
  await ensureSchema();
  const [payments, campaignPayments] = await Promise.all([
    prisma.subscriptionPayment.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.campaignPayment.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } })
  ]);

  const subscriptionRows = payments.map((payment) => ({ ...payment, source: "اشتراك" as const, messages: 0 }));
  const campaignRows = campaignPayments.map((payment) => ({ ...payment, source: "شحن رسائل حملات" as const }));

  return [...subscriptionRows, ...campaignRows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/**
 * Fetches one invoice for the printable receipt page - scoped to the
 * requesting tenant so a customer can never load another tenant's invoice
 * by guessing/incrementing an id.
 */
export async function getInvoiceForTenant(tenantId: string, invoiceId: string) {
  await ensureSchema();
  const [subscription, subscriptionPayment, campaignPayment] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId } }),
    prisma.subscriptionPayment.findFirst({ where: { id: invoiceId, tenantId } }),
    prisma.campaignPayment.findFirst({ where: { id: invoiceId, tenantId } })
  ]);

  if (subscriptionPayment) {
    return {
      ...subscriptionPayment,
      source: "اشتراك" as const,
      messages: 0,
      description: `اشتراك Linkly${subscriptionPayment.planName ? ` - ${subscriptionPayment.planName}` : ""}`,
      companyName: subscription?.companyName || tenantId
    };
  }
  if (campaignPayment) {
    return {
      ...campaignPayment,
      source: "شحن رسائل حملات" as const,
      planName: "",
      planEmployeeLimit: 0,
      description: `شحن ${campaignPayment.messages.toLocaleString("en-US")} رسالة حملات`,
      companyName: subscription?.companyName || tenantId
    };
  }
  return null;
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
export async function applyConfirmedSubscriptionPayment(paymentId: string, details?: GatewayPaymentDetails, allowAutoRenewEnroll = false): Promise<{ activated: boolean; periodStart?: string; periodEnd?: string }> {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { activated: false };

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { tenantId: payment.tenantId } });
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const period = computeSubscriptionPeriod({
      now: nowDate,
      currentStatus: existing?.status,
      currentPlan: existing?.plan,
      currentRenewalAt: existing?.renewalAt,
      stagedPlanName: payment.planName
    });

    const claimed = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, status: { not: PAYMENT_STATUS.completed } },
      data: {
        status: PAYMENT_STATUS.completed,
        completedAt: now,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        failedAt: "",
        ...gatewayColumns({ ...details, gatewayStatus: details?.gatewayStatus ?? "paid", failureReason: "" })
      }
    });
    if (claimed.count !== 1) return null;

    const amountSar = payment.amountHalalas > 0 ? Math.round(payment.amountHalalas / 100) : Math.round(payment.amount);
    const owner = await tx.userAccount.findFirst({
      where: { tenantId: payment.tenantId, role: "مالك الحساب" },
      orderBy: { createdAt: "asc" }
    }) ?? await tx.userAccount.findFirst({
      where: { tenantId: payment.tenantId },
      orderBy: { createdAt: "asc" }
    });

    await tx.subscription.upsert({
      where: { tenantId: payment.tenantId },
      update: {
        status: "نشط",
        amount: amountSar,
        billingCycle: "شهري",
        renewalAt: period.periodEnd,
        // Paying again is an unambiguous signal the owner wants to keep
        // going, even if they'd previously marked the subscription
        // cancelled (see app/api/billing/cancel).
        cancelledAt: "",
        updatedAt: nowTimestamp(),
        // Plan/employeeLimit come from the staged plan whenever the payment
        // carries one (every self-serve checkout; admin invoices carry none
        // and leave the plan as-is). Renewing the SAME plan never lowers a
        // limit the platform team raised by hand; a real plan change applies
        // the new plan's limit exactly.
        ...(payment.planName
          ? {
              plan: payment.planName,
              employeeLimit: existing && existing.plan === payment.planName
                ? Math.max(existing.employeeLimit, payment.planEmployeeLimit)
                : payment.planEmployeeLimit
            }
          : {}),
        // allowAutoRenewEnroll must be true (only confirm-payment, with a
        // real enableAutoRenew from the client, and attemptAutoRenewals,
        // re-affirming an already-opted-in subscription, ever pass it) -
        // details.cardToken alone is NOT consent: Moyasar's account may
        // return a token on every card payment regardless of the "save my
        // card" checkbox, and callers with no consent signal at all (the
        // stale-payment reconciler) must never enroll a card just because
        // one happened to come back on the gateway response.
        ...(allowAutoRenewEnroll && details?.cardToken
          ? { autoRenewEnabled: 1, savedCardToken: details.cardToken, savedCardLast4: details.cardLast4 || "", savedCardBrand: details.cardBrand || "", autoRenewFailCount: 0 }
          : {})
      },
      create: {
        id: `sub-${payment.tenantId}`,
        tenantId: payment.tenantId,
        companyName: owner?.name || payment.tenantId,
        ownerName: owner?.name || payment.tenantId,
        ownerEmail: owner?.email || "",
        plan: payment.planName || "باقة البداية",
        status: "نشط",
        employeeLimit: payment.planName ? payment.planEmployeeLimit : 1,
        amount: amountSar,
        billingCycle: "شهري",
        renewalAt: period.periodEnd,
        createdAt: now,
        updatedAt: nowTimestamp(),
        ...(allowAutoRenewEnroll && details?.cardToken
          ? { autoRenewEnabled: 1, savedCardToken: details.cardToken, savedCardLast4: details.cardLast4 || "", savedCardBrand: details.cardBrand || "" }
          : {})
      }
    });
    return period;
  });

  if (!result) return { activated: false };
  return { activated: true, periodStart: result.periodStart, periodEnd: result.periodEnd };
}

/**
 * Campaign-message counterpart of applyConfirmedSubscriptionPayment: marks
 * the CampaignPayment completed and credits the tenant's message balance -
 * the ONLY place a paid top-up turns into sendable messages. Idempotent via
 * the same compare-and-swap claim, so a redelivered webhook can't double
 * credit. Also records the top-up as the new 100% baseline for the
 * low-balance alerts (50%/20%/5%), which previously only happened for manual
 * admin top-ups and never for real paid ones.
 */
export async function applyConfirmedCampaignPayment(paymentId: string, details?: GatewayPaymentDetails): Promise<{ credited: boolean; messages: number }> {
  const payment = await prisma.campaignPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { credited: false, messages: 0 };

  const credited = await prisma.$transaction(async (tx) => {
    const now = new Date().toISOString();
    const claimed = await tx.campaignPayment.updateMany({
      where: { id: payment.id, status: { not: PAYMENT_STATUS.completed } },
      data: {
        status: PAYMENT_STATUS.completed,
        completedAt: now,
        failedAt: "",
        ...gatewayColumns({ ...details, gatewayStatus: details?.gatewayStatus ?? "paid", failureReason: "" })
      }
    });
    if (claimed.count !== 1) return false;
    await tx.campaignBalance.upsert({
      where: { tenantId: payment.tenantId },
      update: { balance: { increment: payment.messages }, lastTopUpAmount: payment.messages, updatedAt: now },
      create: { tenantId: payment.tenantId, balance: payment.messages, lastTopUpAmount: payment.messages, updatedAt: now }
    });
    return true;
  });

  return { credited, messages: credited ? payment.messages : 0 };
}

/**
 * Records a non-success outcome from the gateway on a payment row.
 *
 * - "failed"/"expired" only ever move a PENDING row (a completed payment
 *   can't retroactively fail).
 * - "refunded" only ever moves a COMPLETED row, and does NOT revoke the
 *   subscription/balance automatically - it raises an admin alert instead,
 *   so a human decides whether to suspend the tenant or claw back credit.
 *
 * Returns whether a row actually changed, so callers can skip logging for
 * redelivered events.
 */
export async function markPaymentOutcome(
  kind: PaymentKind,
  paymentId: string,
  outcome: "failed" | "expired" | "refunded",
  details?: GatewayPaymentDetails
): Promise<{ changed: boolean }> {
  const now = new Date().toISOString();
  const nextStatus = outcome === "failed" ? PAYMENT_STATUS.failed : outcome === "expired" ? PAYMENT_STATUS.expired : PAYMENT_STATUS.refunded;
  const fromStatus = outcome === "refunded" ? PAYMENT_STATUS.completed : PAYMENT_STATUS.pending;
  const data = {
    status: nextStatus,
    ...(outcome === "refunded" ? {} : { failedAt: now }),
    ...gatewayColumns(details)
  };

  const result = kind === "subscription"
    ? await prisma.subscriptionPayment.updateMany({ where: { id: paymentId, status: fromStatus }, data })
    : await prisma.campaignPayment.updateMany({ where: { id: paymentId, status: fromStatus }, data });
  const changed = result.count === 1;

  if (changed && outcome === "refunded") {
    const payment = kind === "subscription"
      ? await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } })
      : await prisma.campaignPayment.findUnique({ where: { id: paymentId } });
    if (payment) {
      await logAdminAction(
        payment.tenantId,
        await getTenantCompanyName(payment.tenantId),
        `تم استرداد دفعة ${kind === "subscription" ? "اشتراك" : "شحن رسائل"} بقيمة ${payment.amount} ر.س عبر بوابة الدفع (${payment.moyasarId}). راجع حالة الحساب وقرر تعليق الاشتراك أو خصم الرصيد يدويًا.`,
        "تنبيه"
      );
    }
  }

  return { changed };
}

/**
 * Applies a verified Moyasar invoice status to one of our payment rows.
 * Shared by the live webhooks and the cron reconciler so both record the
 * same statuses, gateway details and side effects (activation / credit /
 * admin log). `invoiceStatus` MUST come from fetchMoyasarInvoice, never from
 * a webhook body. Returns what happened for logging.
 */
export async function applyVerifiedGatewayOutcome(
  kind: PaymentKind,
  paymentId: string,
  invoiceStatus: string,
  details?: GatewayPaymentDetails,
  // Defaults to false: only a caller with a real, explicit consent signal
  // (app/api/billing/confirm-payment, with the client's own enableAutoRenew)
  // should ever pass true. The cron reconciler below has no such signal and
  // must never enroll a card just because Moyasar's response happened to
  // include a token.
  allowAutoRenewEnroll = false
): Promise<{ outcome: "completed" | "failed" | "expired" | "refunded" | "pending"; changed: boolean }> {
  const mapped = mapMoyasarInvoiceStatus(invoiceStatus);
  if (!mapped) return { outcome: "pending", changed: false };
  if (mapped === "completed") {
    if (kind === "subscription") {
      const { activated } = await applyConfirmedSubscriptionPayment(paymentId, details, allowAutoRenewEnroll);
      return { outcome: "completed", changed: activated };
    }
    const { credited } = await applyConfirmedCampaignPayment(paymentId, details);
    return { outcome: "completed", changed: credited };
  }
  const { changed } = await markPaymentOutcome(kind, paymentId, mapped, details);
  return { outcome: mapped, changed };
}

/**
 * Safety net behind the Moyasar webhooks: sweeps SubscriptionPayment/
 * CampaignPayment rows still "قيد الانتظار" past staleAfterMs and asks
 * Moyasar directly what actually happened to each one, rather than leaving
 * them stuck forever if a webhook delivery was ever missed or misrouted.
 * A row Moyasar confirms paid gets applied exactly like a live webhook
 * would; anything else (failed/canceled/still genuinely unpaid after this
 * long) is marked "منتهي الصلاحية" so it stops counting as outstanding
 * revenue, with an admin-log alert either way so this doesn't happen
 * silently.
 */
export async function reconcileStalePendingPayments(staleAfterMs = 24 * 60 * 60 * 1000) {
  const { fetchMoyasarInvoice, fetchMoyasarPayment, summarizeMoyasarInvoice } = await import("./moyasar");
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  let reconciled = 0;
  let expired = 0;
  let failed = 0;

  const reconcileOne = async (kind: PaymentKind, payment: { id: string; tenantId: string; amount: number; amountHalalas: number; moyasarId: string }) => {
    // Only real Moyasar ids can be asked about. Dev-simulator ("test_"),
    // Stripe ("stripe_test_") and manual rows have nothing to verify against,
    // so past the stale window they simply expire.
    const isMoyasarId = payment.moyasarId && !payment.moyasarId.startsWith("test_") && !payment.moyasarId.startsWith("stripe_test_");
    // A row can hold either a hosted-invoice id (admin-created charges) or a
    // raw Payment id (the embedded checkout writes the Payment id straight
    // into moyasarId once on_completed fires, even for a still-pending row
    // awaiting out-of-band 3-D Secure - see confirm-payment routes). There is
    // no reliable way to tell which from the id alone, so try invoice first
    // and fall back to a direct Payment lookup rather than treating a 404
    // here as "this payment doesn't exist".
    const invoice = isMoyasarId ? await fetchMoyasarInvoice(payment.moyasarId) : null;
    const moyasarPayment = isMoyasarId && !invoice ? await fetchMoyasarPayment(payment.moyasarId) : null;
    const gatewayAmount = invoice?.amount ?? moyasarPayment?.amount;
    const gatewayStatus = invoice?.status ?? moyasarPayment?.status;

    if (gatewayAmount !== undefined && !invoiceAmountMatches(gatewayAmount, payment)) {
      await logAdminAction(
        payment.tenantId,
        await getTenantCompanyName(payment.tenantId),
        `تعارض مبلغ أثناء المطابقة الآلية: دفعة Moyasar ${invoice?.id ?? moyasarPayment?.id} بقيمة ${gatewayAmount} هللة بينما الدفعة المسجلة ${expectedHalalas(payment)} هللة. لم يتم تفعيل أي مزايا - تحقق يدويًا.`,
        "خطأ"
      );
      return;
    }

    const status = gatewayStatus && mapMoyasarInvoiceStatus(gatewayStatus) ? gatewayStatus : "expired";
    const details = invoice
      ? summarizeMoyasarInvoice(invoice)
      : moyasarPayment
        ? summarizeMoyasarPayment(moyasarPayment)
        : { gatewayStatus: "expired", failureReason: "لم يُستكمل الدفع خلال المهلة" };
    const { outcome, changed } = await applyVerifiedGatewayOutcome(kind, payment.id, status, details);
    if (!changed) return;

    if (outcome === "completed") {
      reconciled += 1;
      await logAdminAction(
        payment.tenantId,
        await getTenantCompanyName(payment.tenantId),
        `تمت مطابقة دفعة ${kind === "subscription" ? "اشتراك" : "شحن رسائل"} متأخرة بقيمة ${payment.amount} ر.س بعد تحقق آلي من Moyasar (لم يصل الويبهوك في وقته).`,
        "تنبيه"
      );
    } else if (outcome === "failed") {
      failed += 1;
    } else {
      expired += 1;
    }
  };

  const stalePayments = await prisma.subscriptionPayment.findMany({
    where: { status: PAYMENT_STATUS.pending, createdAt: { lt: cutoff } },
    take: 50
  });
  for (const payment of stalePayments) await reconcileOne("subscription", payment);

  const staleCampaignPayments = await prisma.campaignPayment.findMany({
    where: { status: PAYMENT_STATUS.pending, createdAt: { lt: cutoff } },
    take: 50
  });
  for (const payment of staleCampaignPayments) await reconcileOne("campaign_topup", payment);

  return { reconciled, expired, failed };
}

/** The halalas we expect the gateway to have charged for a payment row. */
export function expectedHalalas(payment: { amount: number; amountHalalas: number }) {
  return payment.amountHalalas > 0 ? payment.amountHalalas : Math.round(payment.amount * 100);
}

/**
 * A paid invoice only activates benefits when the amount Moyasar actually
 * collected matches what we staged. Invoices are created by us with a fixed
 * amount, so a mismatch means a tampered/mismatched record - never apply it
 * silently.
 */
export function invoiceAmountMatches(invoiceAmountHalalas: number, payment: { amount: number; amountHalalas: number }) {
  if (!Number.isFinite(invoiceAmountHalalas) || invoiceAmountHalalas <= 0) return false;
  return invoiceAmountHalalas === expectedHalalas(payment);
}

export async function logAdminAction(tenantId: string, clientName: string, message: string, level: "معلومة" | "تنبيه" | "خطأ" = "معلومة", source = "لوحة الأدمن") {
  await prisma.adminLog.create({
    data: {
      id: `log-${randomUUID()}`,
      at: nowTimestamp(),
      clientId: tenantId,
      clientName,
      source,
      level,
      message
    }
  });
}

// Every admin_logs call site needs the tenant's display name (the table
// only stores it as a denormalized string, not a live join) - this is the
// same subscription.companyName-with-tenantId-fallback lookup every
// existing site already duplicated ad hoc.
export async function getTenantCompanyName(tenantId: string): Promise<string> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  return subscription?.companyName || tenantId;
}

const trialReminderStages: Array<{ id: string; withinHours: number }> = [
  { id: "24h", withinHours: 24 },
  { id: "6h", withinHours: 6 }
];

/**
 * Nudges trial accounts toward converting before they expire. Runs off the
 * existing cron trigger rather than a new schedule; dedup uses admin_logs
 * itself (tagged with a [trial-reminder-*] marker) instead of a new DB
 * column, so a subscription only gets each stage's email once regardless of
 * how often the cron fires.
 */
export async function sendTrialEndingReminders(baseUrl: string) {
  const { sendTrialEndingEmail } = await import("./email");
  const { getTenantBranding } = await import("./tenant-branding");
  const trialSubscriptions = await prisma.subscription.findMany({ where: { status: "تجربة" } });
  const now = Date.now();
  let sent = 0;

  for (const subscription of trialSubscriptions) {
    const msLeft = new Date(subscription.renewalAt).getTime() - now;
    if (!Number.isFinite(msLeft) || msLeft <= 0) continue;
    const hoursLeft = msLeft / 3_600_000;
    const stage = trialReminderStages.find((candidate) => hoursLeft <= candidate.withinHours);
    if (!stage) continue;

    const marker = `[trial-reminder-${stage.id}:${subscription.tenantId}]`;
    const alreadySent = await prisma.adminLog.findFirst({ where: { message: { contains: marker } } });
    if (alreadySent) continue;

    const owner = await prisma.userAccount.findFirst({
      where: { tenantId: subscription.tenantId, role: "مالك الحساب" },
      orderBy: { createdAt: "asc" }
    });

    let delivered = false;
    if (owner?.email) {
      const branding = await getTenantBranding(subscription.tenantId);
      delivered = await sendTrialEndingEmail({
        to: owner.email,
        name: subscription.ownerName || owner.name,
        hoursLeft: Math.max(1, Math.round(hoursLeft)),
        billingUrl: `${baseUrl}/billing`,
        branding: { name: branding.name, color: branding.color }
      });
    }

    await logAdminAction(
      subscription.tenantId,
      subscription.companyName,
      `${marker} ${delivered ? "تم إرسال" : "تعذر إرسال"} تذكير بانتهاء التجربة (${Math.max(1, Math.round(hoursLeft))} ساعة متبقية) ${owner?.email ? `إلى ${owner.email}` : "- لا يوجد بريد مالك حساب"}`
    );
    if (delivered) sent += 1;
  }

  return { sent };
}

const renewalReminderStages: Array<{ id: string; withinDays: number }> = [
  { id: "3d", withinDays: 3 },
  { id: "1d", withinDays: 1 }
];

/**
 * Nudges paying (status "نشط") accounts toward renewing before renewalAt
 * lapses. There is no auto-charge today - renewal is the owner returning to
 * /billing themselves - so this is the only warning a paying customer gets
 * before going overdue, mirroring sendTrialEndingReminders' stage/dedup
 * pattern but for the paid-subscription case (pre-launch audit finding).
 */
export async function sendSubscriptionRenewalReminders(baseUrl: string) {
  const { sendSubscriptionRenewalEmail } = await import("./email");
  const { getTenantBranding } = await import("./tenant-branding");
  // Auto-renew subscriptions get charged automatically instead (see
  // attemptAutoRenewals) - a "please renew manually" nudge would be
  // confusing noise for them.
  const activeSubscriptions = await prisma.subscription.findMany({ where: { status: "نشط", cancelledAt: "", autoRenewEnabled: 0 } });
  const now = Date.now();
  let sent = 0;

  for (const subscription of activeSubscriptions) {
    const renewalTime = new Date(subscription.renewalAt).getTime();
    const msLeft = renewalTime - now;
    if (!Number.isFinite(msLeft) || msLeft <= 0) continue;
    const daysLeft = msLeft / 86_400_000;
    const stage = renewalReminderStages.find((candidate) => daysLeft <= candidate.withinDays);
    if (!stage) continue;

    const marker = `[renewal-reminder-${stage.id}:${subscription.tenantId}]`;
    const alreadySent = await prisma.adminLog.findFirst({ where: { message: { contains: marker } } });
    if (alreadySent) continue;

    const owner = await prisma.userAccount.findFirst({
      where: { tenantId: subscription.tenantId, role: "مالك الحساب" },
      orderBy: { createdAt: "asc" }
    });

    let delivered = false;
    if (owner?.email) {
      const branding = await getTenantBranding(subscription.tenantId);
      delivered = await sendSubscriptionRenewalEmail({
        to: owner.email,
        name: subscription.ownerName || owner.name,
        daysLeft: Math.max(1, Math.round(daysLeft)),
        renewalDate: isoDate(new Date(renewalTime)),
        billingUrl: `${baseUrl}/billing`,
        branding: { name: branding.name, color: branding.color }
      });
    }

    await logAdminAction(
      subscription.tenantId,
      subscription.companyName,
      `${marker} ${delivered ? "تم إرسال" : "تعذر إرسال"} تذكير بتجديد الاشتراك (${Math.max(1, Math.round(daysLeft))} يوم متبقٍ) ${owner?.email ? `إلى ${owner.email}` : "- لا يوجد بريد مالك حساب"}`
    );
    if (delivered) sent += 1;
  }

  return { sent };
}

/** Consecutive failures before auto-renew disables itself and stops retrying a dead card. */
const AUTO_RENEW_MAX_FAILURES = 3;

/**
 * Charges every due, opted-in subscription's saved card - the only place
 * that actually happens automatically (everything else in this app is the
 * owner manually returning to /billing). Runs off the same cron as the
 * reminder emails. Each attempt stages a real SubscriptionPayment row
 * first so it shows up in the normal payment history/invoices exactly like
 * a self-serve checkout would, and reuses applyConfirmedSubscriptionPayment
 * for activation so the two paths can never drift apart.
 */
export async function attemptAutoRenewals(baseUrl: string) {
  const { sendSubscriptionRenewalFailedEmail } = await import("./email");
  const { getTenantBranding } = await import("./tenant-branding");
  const now = new Date();
  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: "نشط",
      cancelledAt: "",
      autoRenewEnabled: 1,
      savedCardToken: { not: "" },
      renewalAt: { lte: now.toISOString() },
      autoRenewFailCount: { lt: AUTO_RENEW_MAX_FAILURES }
    }
  });

  let charged = 0;
  let failed = 0;

  for (const subscription of dueSubscriptions) {
    const plan = await prisma.plan.findFirst({ where: { name: subscription.plan, active: 1 } });
    if (!plan) continue;

    const paymentId = `sub-pay-autorenew-${randomUUID()}`;
    const amountHalalas = plan.monthlyPrice * 100;
    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId,
        tenantId: subscription.tenantId,
        amount: plan.monthlyPrice,
        amountHalalas,
        status: PAYMENT_STATUS.pending,
        createdAt: now.toISOString(),
        planName: plan.name,
        planEmployeeLimit: plan.employeeLimit,
        listPrice: plan.monthlyPrice,
        gateway: PAYMENT_GATEWAY.moyasar,
        gatewayStatus: "initiated",
        initiatedBy: "system"
      }
    });

    const metadata = buildPaymentMetadata({
      kind: "subscription",
      tenantId: subscription.tenantId,
      paymentId,
      initiatedBy: "system",
      companyName: subscription.companyName,
      planName: plan.name,
      gateway: PAYMENT_GATEWAY.moyasar
    });
    const charge = await chargeSavedCard({
      token: subscription.savedCardToken,
      amountHalalas,
      description: paymentDescription("subscription", { companyName: subscription.companyName, planName: plan.name }),
      metadata
    });

    const owner = await prisma.userAccount.findFirst({
      where: { tenantId: subscription.tenantId, role: "مالك الحساب" },
      orderBy: { createdAt: "asc" }
    });

    if (charge.ok && charge.payment.status === "paid") {
      const details = summarizeMoyasarPayment(charge.payment);
      await prisma.subscriptionPayment.update({ where: { id: paymentId }, data: { moyasarId: charge.payment.id } });
      // true: this subscription was only selected by the dueSubscriptions
      // query above because autoRenewEnabled=1 and savedCardToken is already
      // set - consent already happened at enrollment, this just re-affirms
      // it (and resets autoRenewFailCount) on a successful charge.
      const { activated } = await applyConfirmedSubscriptionPayment(paymentId, details, true);
      if (activated) {
        charged += 1;
        await logAdminAction(
          subscription.tenantId,
          subscription.companyName,
          `[auto-renew] تم تجديد الاشتراك تلقائيًا بقيمة ${plan.monthlyPrice} ر.س عبر البطاقة المحفوظة (••••${subscription.savedCardLast4}).`
        );
      }
      continue;
    }

    // Declined, expired card, or the account doesn't actually support
    // token charges - either way, never retry silently forever.
    await markPaymentOutcome("subscription", paymentId, "failed", { gateway: PAYMENT_GATEWAY.moyasar, failureReason: charge.ok ? charge.payment.message || "" : charge.error });
    const failCount = subscription.autoRenewFailCount + 1;
    const disableAutoRenew = failCount >= AUTO_RENEW_MAX_FAILURES;
    await prisma.subscription.update({
      where: { tenantId: subscription.tenantId },
      data: {
        autoRenewFailCount: failCount,
        ...(disableAutoRenew ? { autoRenewEnabled: 0, savedCardToken: "", savedCardLast4: "", savedCardBrand: "" } : {})
      }
    });
    failed += 1;

    if (owner?.email) {
      const branding = await getTenantBranding(subscription.tenantId);
      await sendSubscriptionRenewalFailedEmail({
        to: owner.email,
        name: subscription.ownerName || owner.name,
        disabled: disableAutoRenew,
        billingUrl: `${baseUrl}/billing`,
        branding: { name: branding.name, color: branding.color }
      }).catch((error) => console.error("Auto-renew failure email failed", error));
    }

    await logAdminAction(
      subscription.tenantId,
      subscription.companyName,
      `[auto-renew] فشل التجديد التلقائي (محاولة ${failCount}/${AUTO_RENEW_MAX_FAILURES})${disableAutoRenew ? " - تم إيقاف التجديد التلقائي" : ""}: ${charge.ok ? charge.payment.message || "مرفوضة" : charge.error}`,
      "خطأ"
    );
  }

  return { charged, failed };
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
 * Resends a fresh 3-day activation link for a tenant whose owner account was
 * never activated (the original link expired, or the first email never
 * arrived) - reuses the SAME tenant/employee/subscription rows from the
 * original signup instead of creating a duplicate. Mirrors what "forgot
 * password" already does for this exact case (see
 * app/api/auth/forgot-password/route.ts) so an abandoned first attempt at
 * this email is never a permanent dead end.
 */
async function resendActivationForUnactivatedAccount(account: { email: string; name: string; tenantId: string }) {
  const activationToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(activationToken).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString();

  await prisma.$transaction([
    prisma.employeeInvite.deleteMany({ where: { email: account.email } }),
    prisma.employeeInvite.create({
      data: {
        id: `invite-${randomUUID()}`,
        email: account.email,
        tokenHash,
        expiresAt,
        purpose: "employee_activation",
        createdAt: new Date().toISOString()
      }
    })
  ]);

  const origin = process.env.NODE_ENV === "production"
    ? "https://linklysa.io"
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const activationUrl = `${origin.replace(/\/$/, "")}/activate?token=${activationToken}`;
  const inviteDelivery = await sendActivationEmail({ to: account.email, name: account.name, activationUrl });

  const subscription = await prisma.subscription.findUnique({ where: { tenantId: account.tenantId } });
  return { subscription, inviteDelivery };
}

/**
 * Real onboarding: creates an actual tenant, a real login account (via the
 * same activation-link flow used for inviting employees), and a
 * subscription record. This is the thing the old admin panel never did -
 * it only wrote to a disconnected demo table.
 */
export async function createTenantWithSubscription(input: CreateTenantInput) {
  await ensureSchema();
  const email = input.ownerEmail.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("صيغة البريد الإلكتروني غير صحيحة");

  const existingAccount = await prisma.userAccount.findUnique({ where: { email } });
  if (existingAccount) {
    if (existingAccount.passwordHash) throw new Error("هذا البريد الإلكتروني مستخدم بالفعل لحساب آخر على المنصة");
    return resendActivationForUnactivatedAccount(existingAccount);
  }

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
    ? "https://linklysa.io"
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

  // Switching the plan name alone leaves employeeLimit/amount stale unless
  // the caller also happens to pass them - look the target plan up so an
  // admin can just pick a plan by name and have its real limit/price follow
  // automatically, the same way a paid checkout would apply them.
  let derivedEmployeeLimit = input.employeeLimit;
  let derivedAmount = input.amount;
  let derivedStatus = input.status;
  let derivedBillingCycle = input.billingCycle;
  let derivedRenewalAt = input.renewalAt;
  if (input.plan !== undefined && input.plan !== existing.plan) {
    const targetPlan = await prisma.plan.findUnique({ where: { name: input.plan } });
    if (!targetPlan) throw new Error("الباقة المطلوبة غير موجودة");
    if (derivedEmployeeLimit === undefined) derivedEmployeeLimit = targetPlan.employeeLimit;
    if (derivedAmount === undefined) derivedAmount = targetPlan.monthlyPrice;
    // Manually assigning a real plan to a tenant still on a trial cycle
    // means the trial is over - graduate it into an active monthly
    // subscription with a fresh renewal date, the same way a paid checkout
    // would, instead of leaving a stale "تجربة" badge next to the new plan.
    if (existing.billingCycle.startsWith("تجربة")) {
      if (derivedStatus === undefined) derivedStatus = "نشط";
      if (derivedBillingCycle === undefined) derivedBillingCycle = "شهري";
      if (derivedRenewalAt === undefined) {
        const renewalDate = new Date();
        renewalDate.setMonth(renewalDate.getMonth() + 1);
        derivedRenewalAt = renewalDate.toISOString().slice(0, 10);
      }
    }
  }

  const updated = await prisma.subscription.update({
    where: { tenantId },
    data: {
      plan: input.plan ?? existing.plan,
      status: derivedStatus ?? existing.status,
      employeeLimit: derivedEmployeeLimit ?? existing.employeeLimit,
      amount: derivedAmount ?? existing.amount,
      billingCycle: derivedBillingCycle ?? existing.billingCycle,
      renewalAt: derivedRenewalAt ?? existing.renewalAt,
      updatedAt: nowTimestamp()
    }
  });

  const changes: string[] = [];
  if (derivedEmployeeLimit !== undefined && derivedEmployeeLimit !== existing.employeeLimit) {
    changes.push(`حد المستخدمين من ${existing.employeeLimit} إلى ${derivedEmployeeLimit}`);
  }
  if (derivedStatus !== undefined && derivedStatus !== existing.status) {
    changes.push(`حالة الاشتراك من ${existing.status} إلى ${derivedStatus}`);
  }
  if (input.plan !== undefined && input.plan !== existing.plan) {
    changes.push(`الباقة من ${existing.plan} إلى ${input.plan}`);
  }
  if (derivedBillingCycle !== undefined && derivedBillingCycle !== existing.billingCycle) {
    changes.push(`دورة الفوترة من ${existing.billingCycle} إلى ${derivedBillingCycle}`);
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
    // Work hours and connected-channel settings.
    prisma.workSchedule.deleteMany({ where: { tenantId } }),
    prisma.integrationSetting.deleteMany({ where: { tenantId } }),
    prisma.emailIntegration.deleteMany({ where: { tenantId } }),
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
