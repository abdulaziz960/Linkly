import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { buildPaymentMetadata, isMoyasarConfigured } from "../../../../lib/moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../lib/payment-status";
import { computeProrationCredit } from "../../../../lib/subscriptions";
import { isBillingCycle, priceForCycle, type BillingCycle } from "../../../../lib/billing-pricing";

export const runtime = "nodejs";

/**
 * Self-serve checkout: the tenant owner picks a plan on /billing and is
 * sent to our own embedded card form at /billing/pay/[paymentId] (Moyasar.js,
 * our design). Only a SubscriptionPayment row is staged here; the live
 * Subscription is not created or modified until /api/billing/confirm-payment
 * verifies a paid Moyasar Payment directly with our secret key.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "إدارة الاشتراك متاحة لمالك الحساب" }, { status: 403 });
  const { planId, billingCycle: requestedBillingCycle } = await request.json().catch(() => ({ planId: "" })) as { planId?: string; billingCycle?: unknown };
  const billingCycle: BillingCycle = isBillingCycle(requestedBillingCycle) ? requestedBillingCycle : "شهري";
  await ensureSchema();
  const plan = await prisma.plan.findFirst({ where: { id: planId, active: 1 } });
  if (!plan) return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 404 });
  if (plan.monthlyPrice < 1) return NextResponse.json({ error: "سعر الباقة غير صالح" }, { status: 400 });
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  const companyName = subscription?.companyName || user.name;
  const listPrice = priceForCycle(plan.monthlyPrice, billingCycle);

  // A plan change (including a downgrade) takes effect immediately on
  // confirmation with no separate enforcement afterwards - without this
  // check here, a tenant with more employees than the new plan allows
  // would keep every existing employee active indefinitely, silently over
  // the limit, since app/api/employees/route.ts only blocks *new* hires
  // (pre-launch audit finding).
  if (subscription && subscription.plan !== plan.name) {
    const employeeCount = await prisma.employee.count({ where: { tenantId: user.tenantId } });
    if (employeeCount > plan.employeeLimit) {
      return NextResponse.json(
        { error: `عدد الموظفين الحالي (${employeeCount}) أكبر من الحد المسموح في هذه الباقة (${plan.employeeLimit}). ألغِ بعض الموظفين قبل التبديل إليها.` },
        { status: 400 }
      );
    }
  }
  const proration = computeProrationCredit({
    now: new Date(),
    currentStatus: subscription?.status,
    currentPlan: subscription?.plan,
    currentAmount: subscription?.amount,
    currentRenewalAt: subscription?.renewalAt,
    currentBillingCycle: isBillingCycle(subscription?.billingCycle) ? subscription?.billingCycle : "شهري",
    newPlanName: plan.name,
    newPlanPrice: listPrice
  });
  const chargeAmount = proration.creditAmount > 0 ? proration.finalAmount : listPrice;
  const amountHalalas = Math.round(chargeAmount * 100);

  // A pending payment older than this was almost certainly abandoned (closed
  // tab, back button, Moyasar sandbox test run) rather than still in
  // progress - expire it instead of letting it block new checkouts and pile
  // up forever as "pending" with no way to reconcile.
  const pendingStaleAfterMs = 60 * 60 * 1000;
  const staleCutoff = new Date(Date.now() - pendingStaleAfterMs).toISOString();
  await prisma.subscriptionPayment.updateMany({
    where: { tenantId: user.tenantId, status: PAYMENT_STATUS.pending, createdAt: { lt: staleCutoff } },
    data: { status: PAYMENT_STATUS.expired, failedAt: new Date().toISOString(), failureReason: "لم يُستكمل الدفع خلال المهلة" }
  });

  const activePending = await prisma.subscriptionPayment.findFirst({
    where: { tenantId: user.tenantId, status: PAYMENT_STATUS.pending, planName: plan.name, billingCycle },
    orderBy: { createdAt: "desc" }
  });
  if (activePending) {
    // The embedded checkout page (app/billing/pay/[paymentId]) recomputes
    // amount/description/gateway itself from the row, so re-entering the
    // exact same pending row is enough - no paymentUrl to carry forward.
    return NextResponse.json({ paymentId: activePending.id });
  }

  const paymentId = `sub-pay-${randomUUID()}`;
  const stagedRow = {
    id: paymentId,
    tenantId: user.tenantId,
    amount: chargeAmount,
    amountHalalas,
    status: PAYMENT_STATUS.pending,
    createdAt: new Date().toISOString(),
    planName: plan.name,
    planEmployeeLimit: plan.employeeLimit,
    planMessageQuota: plan.messageQuota,
    listPrice,
    billingCycle,
    prorationCreditAmount: proration.creditAmount,
    initiatedBy: "owner"
  };

  if (isMoyasarConfigured()) {
    // No invoice/paymentUrl to create up front - our own /billing/pay/[id]
    // page (Moyasar.js embedded form) creates the actual Moyasar Payment
    // directly from the browser with the publishable key, and reports its
    // id back to /api/billing/confirm-payment once done.
    const metadata = buildPaymentMetadata({
      kind: "subscription",
      tenantId: user.tenantId,
      paymentId,
      initiatedBy: "owner",
      companyName,
      planId: plan.id,
      planName: plan.name,
      gateway: PAYMENT_GATEWAY.moyasar
    });
    await prisma.subscriptionPayment.create({
      data: {
        ...stagedRow,
        gateway: PAYMENT_GATEWAY.moyasar,
        gatewayStatus: "initiated",
        metadataJson: JSON.stringify(metadata)
      }
    });
    return NextResponse.json({ paymentId });
  }
  return NextResponse.json({ error: "بوابة الدفع غير مهيأة حاليًا" }, { status: 503 });
}
