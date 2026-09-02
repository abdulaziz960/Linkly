import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { createMoyasarInvoice, isMoyasarConfigured } from "../../../../lib/moyasar";

export const runtime = "nodejs";
const baseUrl = () => (process.env.NODE_ENV === "production"
  ? "https://linklysa.io"
  : process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

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

  // A pending payment older than this was almost certainly abandoned (closed
  // tab, back button, Moyasar sandbox test run) rather than still in
  // progress - expire it instead of letting it block new checkouts and pile
  // up forever as "pending" with no way to reconcile.
  const pendingStaleAfterMs = 60 * 60 * 1000;
  const staleCutoff = new Date(Date.now() - pendingStaleAfterMs).toISOString();
  await prisma.subscriptionPayment.updateMany({
    where: { tenantId: user.tenantId, status: "قيد الانتظار", createdAt: { lt: staleCutoff } },
    data: { status: "منتهي الصلاحية" }
  });

  const activePending = await prisma.subscriptionPayment.findFirst({
    where: { tenantId: user.tenantId, status: "قيد الانتظار", planName: plan.name },
    orderBy: { createdAt: "desc" }
  });
  if (activePending?.paymentUrl) {
    return NextResponse.json({ paymentUrl: activePending.paymentUrl });
  }

  const paymentId = `sub-pay-${randomUUID()}`;
  // Checkout only stages a SubscriptionPayment. The live Subscription is
  // not created or modified until Moyasar confirms a paid invoice.
  if (isMoyasarConfigured()) {
    try {
      const invoice = await createMoyasarInvoice({ amount: plan.monthlyPrice, amountHalalas, description: `اشتراك Linkly - ${companyName} (${plan.name})`, callbackUrl: `${baseUrl()}/api/admin/subscriptions/payment-webhook`, successUrl: `${baseUrl()}/billing/success`, metadata: { tenantId: user.tenantId, paymentId, planId: plan.id } });
      await prisma.subscriptionPayment.create({ data: { id: paymentId, tenantId: user.tenantId, amount: plan.monthlyPrice, amountHalalas, status: "قيد الانتظار", moyasarId: invoice.id, paymentUrl: invoice.url, createdAt: new Date().toISOString(), planName: plan.name, planEmployeeLimit: plan.employeeLimit } });
      return NextResponse.json({ paymentUrl: invoice.url });
    } catch { return NextResponse.json({ error: "تعذر إنشاء فاتورة الدفع، حاول مرة أخرى" }, { status: 502 }); }
  }
  if (process.env.NODE_ENV === "production" || process.env.MOYASAR_LIVE_MODE === "true") {
    return NextResponse.json({ error: "بوابة الدفع غير مهيأة حاليًا" }, { status: 503 });
  }
  const paymentUrl = `${baseUrl()}/checkout/test?paymentId=${encodeURIComponent(paymentId)}`;
  await prisma.subscriptionPayment.create({ data: { id: paymentId, tenantId: user.tenantId, amount: plan.monthlyPrice, amountHalalas, status: "قيد الانتظار", moyasarId: `test_${paymentId}`, paymentUrl, createdAt: new Date().toISOString(), planName: plan.name, planEmployeeLimit: plan.employeeLimit } });
  return NextResponse.json({ paymentUrl });
}
