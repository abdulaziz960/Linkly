import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { getPaymentCallbackOrigin } from "../../../../lib/app-url";
import { buildPaymentMetadata, createMoyasarInvoice, isMoyasarConfigured, paymentDescription } from "../../../../lib/moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../lib/payment-status";

export const runtime = "nodejs";

/**
 * Self-serve checkout: the tenant owner picks a plan on /billing and is
 * sent to Moyasar's hosted payment page. Only a SubscriptionPayment row is
 * staged here; the live Subscription is not created or modified until
 * Moyasar confirms a paid invoice (see lib/moyasar-webhook.ts).
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
  if (activePending?.paymentUrl) {
    return NextResponse.json({ paymentUrl: activePending.paymentUrl });
  }

  const paymentId = `sub-pay-${randomUUID()}`;
  const description = paymentDescription("subscription", { companyName, planName: plan.name });
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
    try {
      const invoice = await createMoyasarInvoice({
        amount: plan.monthlyPrice,
        amountHalalas,
        description,
        callbackUrl: `${origin}/api/admin/subscriptions/payment-webhook`,
        successUrl: `${origin}/billing/success`,
        backUrl: `${origin}/billing`,
        metadata
      });
      await prisma.subscriptionPayment.create({
        data: {
          ...stagedRow,
          moyasarId: invoice.id,
          paymentUrl: invoice.url,
          gateway: PAYMENT_GATEWAY.moyasar,
          gatewayStatus: invoice.status,
          metadataJson: JSON.stringify(metadata)
        }
      });
      return NextResponse.json({ paymentUrl: invoice.url });
    } catch (error) {
      console.error("Moyasar subscription checkout failed", error);
      return NextResponse.json({ error: "تعذر إنشاء فاتورة الدفع، حاول مرة أخرى" }, { status: 502 });
    }
  }
  if (process.env.NODE_ENV === "production" || process.env.MOYASAR_LIVE_MODE === "true") {
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
