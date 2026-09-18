import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { fetchMoyasarPayment, summarizeMoyasarPayment } from "../../../../../lib/moyasar";
import { applyVerifiedGatewayOutcome, expectedHalalas, getTenantCompanyName, invoiceAmountMatches, logAdminAction } from "../../../../../lib/subscriptions";
import { PAYMENT_STATUS } from "../../../../../lib/payment-status";

export const runtime = "nodejs";

/**
 * Campaign-topup counterpart of /api/billing/confirm-payment: called by the
 * embedded checkout form (app/billing/pay/campaign/[paymentId]) right after
 * Moyasar.js's on_completed fires. The client only ever reports a Payment
 * id - never trusted for its own status - re-fetched here from Moyasar with
 * our secret key, same "never trust the caller" pattern as the subscription
 * flow and lib/moyasar-webhook.ts.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (!(await userHasViewPermission(user, "campaigns"))) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الميزة" }, { status: 403 });

  const { paymentId, moyasarPaymentId } = await request.json().catch(() => ({})) as { paymentId?: string; moyasarPaymentId?: string };
  if (!paymentId || !moyasarPaymentId) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  const payment = await prisma.campaignPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId } });
  if (!payment) return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  if (payment.status !== PAYMENT_STATUS.pending) {
    return NextResponse.json({ ok: true, outcome: payment.status === PAYMENT_STATUS.completed ? "completed" : "already_processed" });
  }

  const moyasarPayment = await fetchMoyasarPayment(moyasarPaymentId);
  if (!moyasarPayment) return NextResponse.json({ error: "تعذر التحقق من الدفعة، حاول مرة أخرى" }, { status: 502 });

  if (!invoiceAmountMatches(moyasarPayment.amount, payment)) {
    console.error(`[moyasar:campaigns-confirm] amount mismatch: payment=${moyasarPayment.amount} expected=${expectedHalalas(payment)}`);
    await logAdminAction(
      payment.tenantId,
      await getTenantCompanyName(payment.tenantId),
      `تعارض مبلغ أثناء تأكيد دفعة شحن رسائل: دفعة Moyasar ${moyasarPaymentId} بقيمة ${moyasarPayment.amount} هللة بينما الدفعة المسجلة ${expectedHalalas(payment)} هللة. لم يتم إضافة أي رصيد - تحقق يدويًا.`,
      "خطأ"
    );
    return NextResponse.json({ error: "تعارض في المبلغ، تواصل مع الدعم" }, { status: 409 });
  }

  // Record which Moyasar Payment this row corresponds to - unlike the
  // invoice flow, we only learn this id now, after the browser reports it.
  await prisma.campaignPayment.update({ where: { id: paymentId }, data: { moyasarId: moyasarPaymentId } });

  const details = summarizeMoyasarPayment(moyasarPayment);
  const { outcome } = await applyVerifiedGatewayOutcome("campaign_topup", paymentId, moyasarPayment.status, details);

  if (outcome === "completed") {
    const companyName = await getTenantCompanyName(payment.tenantId);
    const method = details.paymentMethod ? ` (${details.paymentMethod})` : "";
    await logAdminAction(payment.tenantId, companyName, `تم استلام دفعة شحن رسائل بقيمة ${payment.amount} ر.س عبر Moyasar${method}، وتمت إضافة ${payment.messages.toLocaleString("en-US")} رسالة إلى الرصيد.`);
  }

  return NextResponse.json({ ok: true, outcome });
}
