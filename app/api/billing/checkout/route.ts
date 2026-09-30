import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { getPaymentCallbackOrigin } from "../../../../lib/app-url";
import { buildPaymentMetadata, isMoyasarConfigured } from "../../../../lib/moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../lib/payment-status";
import { computeProrationCredit } from "../../../../lib/subscriptions";
import { reservePromoCodeUsage, releasePromoCodeUsage, promoCodeErrorMessage, type PromoCodeErrorCode } from "../../../../lib/promo-codes";

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
  const { planId, promoCode } = await request.json().catch(() => ({ planId: "" })) as { planId?: string; promoCode?: string };
  await ensureSchema();
  const plan = await prisma.plan.findFirst({ where: { id: planId, active: 1 } });
  if (!plan) return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 404 });
  if (plan.monthlyPrice < 1) return NextResponse.json({ error: "سعر الباقة غير صالح" }, { status: 400 });
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  const companyName = subscription?.companyName || user.name;

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
    newPlanName: plan.name,
    newPlanPrice: plan.monthlyPrice
  });
  const chargeAmount = proration.creditAmount > 0 ? proration.finalAmount : plan.monthlyPrice;
  const origin = getPaymentCallbackOrigin();

  const pendingStaleAfterMs = 60 * 60 * 1000;
  const staleCutoff = new Date(Date.now() - pendingStaleAfterMs).toISOString();
  const staleRows = await prisma.subscriptionPayment.findMany({
    where: { tenantId: user.tenantId, status: PAYMENT_STATUS.pending, createdAt: { lt: staleCutoff } },
    select: { id: true }
  });
  if (staleRows.length) {
    await prisma.subscriptionPayment.updateMany({
      where: { id: { in: staleRows.map((row) => row.id) } },
      data: { status: PAYMENT_STATUS.expired, failedAt: new Date().toISOString(), failureReason: "لم يُستكمل الدفع خلال المهلة" }
    });
    for (const row of staleRows) await releasePromoCodeUsage(row.id, "expired");
  }

  const activePending = await prisma.subscriptionPayment.findFirst({
    where: { tenantId: user.tenantId, status: PAYMENT_STATUS.pending, planName: plan.name },
    orderBy: { createdAt: "desc" }
  });
  if (activePending && !promoCode) {
    return NextResponse.json({ paymentId: activePending.id });
  }
  if (activePending && promoCode) {
    await prisma.subscriptionPayment.update({
      where: { id: activePending.id },
      data: { status: PAYMENT_STATUS.expired, failedAt: new Date().toISOString(), failureReason: "استُبدلت بمحاولة جديدة بكود خصم" }
    });
    await releasePromoCodeUsage(activePending.id, "expired");
  }

  const paymentId = `sub-pay-${randomUUID()}`;
  let finalChargeAmount = chargeAmount;
  let discountAmountSar = 0;
  let normalizedPromoCode = "";

  if (promoCode) {
    let reservationError: PromoCodeErrorCode | null = null;
    await prisma.$transaction(async (tx) => {
      const reservation = await reservePromoCodeUsage(tx, {
        code: promoCode,
        tenantId: user.tenantId,
        planId: plan.id,
        planName: plan.name,
        amountSar: chargeAmount,
        paymentId,
        userId: user.id,
        userName: user.name,
        email: user.email
      });
      if (!reservation.ok) {
        reservationError = reservation.errorCode;
        return;
      }
      finalChargeAmount = reservation.finalAmount;
      discountAmountSar = reservation.discountAmount;
      normalizedPromoCode = promoCode.trim().toUpperCase();
    });
    if (reservationError) {
      return NextResponse.json({ error: promoCodeErrorMessage(reservationError, "ar") }, { status: 400 });
    }
  }

  const amountHalalas = Math.round(finalChargeAmount * 100);
  const stagedRow = {
    id: paymentId,
    tenantId: user.tenantId,
    amount: finalChargeAmount,
    amountHalalas,
    status: PAYMENT_STATUS.pending,
    createdAt: new Date().toISOString(),
    planName: plan.name,
    planEmployeeLimit: plan.employeeLimit,
    listPrice: plan.monthlyPrice,
    prorationCreditAmount: proration.creditAmount,
    promoCode: normalizedPromoCode,
    discountAmount: discountAmountSar,
    initiatedBy: "owner"
  };

  if (isMoyasarConfigured()) {
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
  if (process.env.NODE_ENV === "production" || process.env.MOYASAR_LIVE_MODE === "true" || process.env.ENABLE_TEST_CHECKOUT !== "true") {
    await releasePromoCodeUsage(paymentId, "failed");
    return NextResponse.json({ error: "بوابة الدفع غير مهيأة حاليًا" }, { status: 503 });
  }
  const paymentUrl = `${origin}/checkout/test?paymentId=${encodeURIComponent(paymentId)}`;
  const metadata = buildPaymentMetadata({
    kind: "subscription",
    tenantId: user.tenantId,
    paymentId,
    initiatedBy: "owner",
    companyName,
    planId: plan.id,
    planName: plan.name,
    gateway: PAYMENT_GATEWAY.test
  });
  await prisma.subscriptionPayment.create({
    data: {
      ...stagedRow,
      moyasarId: `test_${paymentId}`,
      paymentUrl,
      gateway: PAYMENT_GATEWAY.test,
      gatewayStatus: "initiated",
      metadataJson: JSON.stringify(metadata)
    }
  });
  return NextResponse.json({ paymentUrl });
}
