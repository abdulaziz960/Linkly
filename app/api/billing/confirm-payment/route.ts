import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { fetchMoyasarPayment, summarizeMoyasarPayment } from "../../../../lib/moyasar";
import { applyVerifiedGatewayOutcome, expectedHalalas, getTenantCompanyName, invoiceAmountMatches, logAdminAction } from "../../../../lib/subscriptions";
import { PAYMENT_STATUS } from "../../../../lib/payment-status";

export const runtime = "nodejs";

/**
 * Called by the embedded checkout form (app/billing/pay/[paymentId]) right
 * after Moyasar.js's on_completed fires. The client only ever reports a
 * Payment id - never trusted for its own status - we re-fetch it from
 * Moyasar with our secret key here, the same "never trust the caller"
 * pattern lib/moyasar-webhook.ts uses for invoice webhooks.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });

  const { paymentId, moyasarPaymentId } = await request.json().catch(() => ({})) as { paymentId?: string; moyasarPaymentId?: string };
  if (!paymentId || !moyasarPaymentId) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  const payment = await prisma.subscriptionPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId } });
  if (!payment) return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  if (payment.status !== PAYMENT_STATUS.pending) {
    return NextResponse.json({ ok: true, outcome: payment.status === PAYMENT_STATUS.completed ? "completed" : "already_processed" });
  }

  const moyasarPayment = await fetchMoyasarPayment(moyasarPaymentId);
  if (!moyasarPayment) return NextResponse.json({ error: "تعذر التحقق من الدفعة، حاول مرة أخرى" }, { status: 502 });

  if (!invoiceAmountMatches(moyasarPayment.amount, payment)) {
    console.error(`[moyasar:billing-confirm] amount mismatch: payment=${moyasarPayment.amount} expected=${expectedHalalas(payment)}`);
    await logAdminAction(
      payment.tenantId,
      await getTenantCompanyName(payment.tenantId),
      `تعارض مبلغ أثناء تأكيد دفعة اشتراك: دفعة Moyasar ${moyasarPaymentId} بقيمة ${moyasarPayment.amount} هللة بينما الدفعة المسجلة ${expectedHalalas(payment)} هللة. لم يتم تفعيل أي مزايا - تحقق يدويًا.`,
      "خطأ"
    );
    return NextResponse.json({ error: "تعارض في المبلغ، تواصل مع الدعم" }, { status: 409 });
  }

  // Record which Moyasar Payment this row corresponds to - unlike the
  // invoice flow, we only learn this id now, after the browser reports it.
  await prisma.subscriptionPayment.update({ where: { id: paymentId }, data: { moyasarId: moyasarPaymentId } });

  const details = summarizeMoyasarPayment(moyasarPayment);
  const { outcome } = await applyVerifiedGatewayOutcome("subscription", paymentId, moyasarPayment.status, details);

  if (outcome === "completed") {
    const companyName = await getTenantCompanyName(payment.tenantId);
    const method = details.paymentMethod ? ` (${details.paymentMethod})` : "";
    await logAdminAction(payment.tenantId, companyName, `تم استلام دفعة اشتراك بقيمة ${payment.amount} ر.س عبر Moyasar${method}، وتم تجديد الاشتراك.`);
  }

  return NextResponse.json({ ok: true, outcome });
}
