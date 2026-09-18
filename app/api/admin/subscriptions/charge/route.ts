import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { ensureSchema } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { getPaymentCallbackOrigin } from "../../../../../lib/app-url";
import { buildPaymentMetadata, createMoyasarInvoice, isMoyasarConfigured, paymentDescription } from "../../../../../lib/moyasar";
import { createStripeCheckoutSession, isStripeConfigured } from "../../../../../lib/stripe";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../../lib/payment-status";

export const runtime = "nodejs";

/**
 * Platform-admin initiated invoice: creates a real payment link the admin
 * sends to the client (renewal reminder, custom amount, etc.). The
 * subscription activates automatically once the gateway confirms payment,
 * through the same webhook / apply path as self-serve checkout.
 */
export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "لا تملك صلاحية الوصول" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { tenantId?: string; amount?: number; gateway?: string } | null;
  const tenantId = body?.tenantId?.trim();
  const amount = Math.max(0, Math.round(Number(body?.amount) || 0));
  const amountHalalas = amount * 100;
  const gateway = body?.gateway === "stripe" ? PAYMENT_GATEWAY.stripe : PAYMENT_GATEWAY.moyasar;

  if (!tenantId) return NextResponse.json({ ok: false, error: "الحساب مطلوب" }, { status: 400 });
  if (amount < 1) return NextResponse.json({ ok: false, error: "قيمة الفاتورة غير صحيحة" }, { status: 400 });

  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return NextResponse.json({ ok: false, error: "الاشتراك غير موجود" }, { status: 404 });

  const paymentId = `sub-pay-${randomUUID()}`;
  const origin = getPaymentCallbackOrigin();
  const metadata = buildPaymentMetadata({
    kind: "subscription",
    tenantId,
    paymentId,
    initiatedBy: "admin",
    companyName: subscription.companyName,
    planName: subscription.plan,
    gateway
  });
  const stagedRow = {
    id: paymentId,
    tenantId,
    amount,
    amountHalalas,
    status: PAYMENT_STATUS.pending,
    createdAt: new Date().toISOString(),
    initiatedBy: "admin",
    gateway,
    metadataJson: JSON.stringify(metadata)
  };

  if (gateway === PAYMENT_GATEWAY.stripe) {
    if (!isStripeConfigured()) {
      return NextResponse.json({ ok: false, error: "Stripe غير مفعّل بعد. أضف STRIPE_SECRET_KEY في متغيرات البيئة." }, { status: 503 });
    }

    try {
      const session = await createStripeCheckoutSession({
        amount,
        description: `${paymentDescription("subscription", { companyName: subscription.companyName, planName: subscription.plan })} [تجريبي]`,
        successUrl: `${origin}/api/admin/subscriptions/stripe-return?session_id={CHECKOUT_SESSION_ID}&paymentId=${paymentId}`,
        cancelUrl: `${origin}/linkly-admin007/payments`,
        metadata
      });

      await prisma.subscriptionPayment.create({
        data: { ...stagedRow, moyasarId: `stripe_test_${session.id}`, paymentUrl: session.url, gatewayStatus: "open" }
      });

      return NextResponse.json({ ok: true, paymentUrl: session.url });
    } catch (error) {
      console.error("Stripe checkout session request failed", error);
      return NextResponse.json({ ok: false, error: "تعذر إنشاء طلب الدفع عبر Stripe، حاول مرة أخرى" }, { status: 502 });
    }
  }

  if (!isMoyasarConfigured()) {
    return NextResponse.json({ ok: false, error: "بوابة الدفع غير مفعّلة بعد. أضف MOYASAR_SECRET_KEY في متغيرات البيئة لتفعيل الفوترة الفعلية." }, { status: 503 });
  }

  try {
    const invoice = await createMoyasarInvoice({
      amount,
      amountHalalas,
      description: paymentDescription("subscription", { companyName: subscription.companyName, planName: subscription.plan }),
      callbackUrl: `${origin}/api/admin/subscriptions/payment-webhook`,
      successUrl: `${origin}/billing/success`,
      backUrl: `${origin}/billing`,
      metadata
    });

    await prisma.subscriptionPayment.create({
      data: { ...stagedRow, moyasarId: invoice.id, paymentUrl: invoice.url, gatewayStatus: invoice.status }
    });

    return NextResponse.json({ ok: true, paymentUrl: invoice.url });
  } catch (error) {
    console.error("Subscription charge request failed", error);
    return NextResponse.json({ ok: false, error: "تعذر إنشاء طلب الدفع، حاول مرة أخرى" }, { status: 502 });
  }
}
