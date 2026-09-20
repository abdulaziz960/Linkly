import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { getPaymentCallbackOrigin } from "../../../../lib/app-url";
import { buildPaymentMetadata, isMoyasarConfigured } from "../../../../lib/moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../lib/payment-status";

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
  const { planId } = await request.json().catch(() => ({ planId: "" })) as { planId?: string };
  await ensureSchema();
  const plan = await prisma.plan.findFirst({ where: { id: planId, active: 1 } });
  if (!plan) return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 404 });
  if (plan.monthlyPrice < 1) return NextResponse.json({ error: "سعر الباقة غير صالح" }, { status: 400 });
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  const companyName = subscription?.companyName || user.name;
  const amountHalalas = plan.monthlyPrice * 100;
  const origin = getPaymentCallbackOrigin();

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
    where: { tenantId: user.tenantId, status: PAYMENT_STATUS.pending, planName: plan.name },
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
    amount: plan.monthlyPrice,
    amountHalalas,
    status: PAYMENT_STATUS.pending,
    createdAt: new Date().toISOString(),
    planName: plan.name,
    planEmployeeLimit: plan.employeeLimit,
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
  // Fail closed by default: a misconfigured non-production environment
  // (e.g. a staging/preview deploy that simply forgot to set NODE_ENV or a
  // Moyasar key) must not silently fall through into letting any logged-in
  // user grant themselves a paid plan for free. This requires an explicit,
  // separate opt-in on top of "doesn't look like production" instead of
  // relying on the absence of production signals alone.
  if (process.env.NODE_ENV === "production" || process.env.MOYASAR_LIVE_MODE === "true" || process.env.ENABLE_TEST_CHECKOUT !== "true") {
    return NextResponse.json({ error: "بوابة الدفع غير مهيأة حاليًا" }, { status: 503 });
  }
  // Local development without a Moyasar key: a simulated payment page that
  // still goes through the exact same activation code path.
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
