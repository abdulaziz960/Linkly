import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { creditEmailCampaignBalance } from "../../../../../lib/email-promotions";
import { ensureEmailPromotionsSchema } from "../../../../../lib/email-promotions-schema";
import { fetchMoyasarPayment, summarizeMoyasarPayment } from "../../../../../lib/moyasar";
import { expectedHalalas, getTenantCompanyName, invoiceAmountMatches, logAdminAction } from "../../../../../lib/subscriptions";
import { PAYMENT_STATUS } from "../../../../../lib/payment-status";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (!(await userHasViewPermission(user, "emailPromotions"))) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الميزة" }, { status: 403 });
  await ensureEmailPromotionsSchema();

  const { paymentId, moyasarPaymentId } = await request.json().catch(() => ({})) as { paymentId?: string; moyasarPaymentId?: string };
  if (!paymentId || !moyasarPaymentId) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  const payment = await prisma.campaignPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId } });
  if (!payment) return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  if (!payment.id.startsWith("pay-email-")) return NextResponse.json({ error: "نوع الدفعة غير صحيح" }, { status: 400 });
  if (payment.status !== PAYMENT_STATUS.pending) {
    return NextResponse.json({ ok: true, outcome: payment.status === PAYMENT_STATUS.completed ? "completed" : "already_processed" });
  }

  const alreadyUsedBy = await prisma.campaignPayment.findFirst({
    where: { moyasarId: moyasarPaymentId, status: PAYMENT_STATUS.completed, id: { not: paymentId } }
  });
  if (alreadyUsedBy) {
    await logAdminAction(
      payment.tenantId,
      await getTenantCompanyName(payment.tenantId),
      `محاولة إعادة استخدام دفعة Moyasar ${moyasarPaymentId} لتأكيد شحن رصيد بريد ${paymentId}. لم تتم إضافة أي رصيد.`,
      "خطأ"
    );
    return NextResponse.json({ error: "هذه الدفعة مستخدمة مسبقًا" }, { status: 409 });
  }

  const moyasarPayment = await fetchMoyasarPayment(moyasarPaymentId);
  if (!moyasarPayment) return NextResponse.json({ error: "تعذر التحقق من الدفعة، حاول مرة أخرى" }, { status: 502 });
  if (!invoiceAmountMatches(moyasarPayment.amount, payment)) {
    await logAdminAction(
      payment.tenantId,
      await getTenantCompanyName(payment.tenantId),
      `تعارض مبلغ أثناء تأكيد شحن رصيد بريد: دفعة Moyasar ${moyasarPaymentId} بقيمة ${moyasarPayment.amount} هللة بينما المسجل ${expectedHalalas(payment)} هللة. لم تتم إضافة الرصيد.`,
      "خطأ"
    );
    return NextResponse.json({ error: "تعارض في المبلغ، تواصل مع الدعم" }, { status: 409 });
  }

  const details = summarizeMoyasarPayment(moyasarPayment);
  const paid = (moyasarPayment.status || "").toLowerCase() === "paid";
  if (!paid) {
    await prisma.campaignPayment.update({
      where: { id: paymentId },
      data: {
        moyasarId: moyasarPaymentId,
        status: PAYMENT_STATUS.failed,
        failedAt: new Date().toISOString(),
        gatewayStatus: details.gatewayStatus || moyasarPayment.status || "failed",
        paymentMethod: details.paymentMethod || "",
        failureReason: details.failureReason || "لم تتم الموافقة على الدفعة"
      }
    });
    return NextResponse.json({ ok: true, outcome: "failed" });
  }

  const now = new Date().toISOString();
  const claimed = await prisma.campaignPayment.updateMany({
    where: { id: payment.id, status: PAYMENT_STATUS.pending },
    data: {
      status: PAYMENT_STATUS.completed,
      completedAt: now,
      moyasarId: moyasarPaymentId,
      gatewayStatus: details.gatewayStatus || "paid",
      paymentMethod: details.paymentMethod || "",
      failureReason: "",
      failedAt: ""
    }
  });
  if (claimed.count === 1) {
    await creditEmailCampaignBalance(payment.tenantId, payment.messages);
    const method = details.paymentMethod ? ` (${details.paymentMethod})` : "";
    await logAdminAction(
      payment.tenantId,
      await getTenantCompanyName(payment.tenantId),
      `تم استلام دفعة شحن رصيد بريد بقيمة ${payment.amount} ر.س عبر Moyasar${method}، وتمت إضافة ${payment.messages.toLocaleString("en-US")} إيميل إلى الرصيد.`
    );
  }

  return NextResponse.json({ ok: true, outcome: "completed" });
}
