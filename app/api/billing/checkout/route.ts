import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { createMoyasarInvoice, isMoyasarConfigured } from "../../../../lib/moyasar";

export const runtime = "nodejs";
const baseUrl = () => (process.env.NODE_ENV === "production"
  ? "https://audiencew.audience.sa"
  : process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "إدارة الاشتراك متاحة لمالك الحساب" }, { status: 403 });
  const { planId } = await request.json().catch(() => ({ planId: "" })) as { planId?: string };
  await ensureSchema();
  const plan = await prisma.plan.findFirst({ where: { id: planId, active: 1 } });
  if (!plan) return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 404 });
  const subscription = await prisma.subscription.upsert({
    where: { tenantId: user.tenantId },
    update: {},
    create: { id: `sub-${user.tenantId}`, tenantId: user.tenantId, companyName: user.name, ownerName: user.name, ownerEmail: user.email, plan: plan.name, status: "تجربة", employeeLimit: plan.employeeLimit, amount: 0, billingCycle: "تجربة 14 يوم", renewalAt: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  });
  if (plan.monthlyPrice < 1) return NextResponse.json({ error: "سعر الباقة غير صالح" }, { status: 400 });
  const paymentId = `sub-pay-${randomUUID()}`;
  await prisma.subscription.update({ where: { tenantId: user.tenantId }, data: { plan: plan.name, employeeLimit: plan.employeeLimit, amount: plan.monthlyPrice, billingCycle: "شهري", status: "بانتظار الدفع" } });
  if (isMoyasarConfigured()) {
    try {
      const invoice = await createMoyasarInvoice({ amount: plan.monthlyPrice, description: `اشتراك AudienceW - ${subscription.companyName} (${plan.name})`, callbackUrl: `${baseUrl()}/api/admin/subscriptions/payment-webhook`, metadata: { tenantId: user.tenantId, paymentId, planId: plan.id } });
      await prisma.subscriptionPayment.create({ data: { id: paymentId, tenantId: user.tenantId, amount: plan.monthlyPrice, status: "قيد الانتظار", moyasarId: invoice.id, paymentUrl: invoice.url, createdAt: new Date().toISOString() } });
      return NextResponse.json({ paymentUrl: invoice.url });
    } catch { return NextResponse.json({ error: "تعذر إنشاء فاتورة الدفع، حاول مرة أخرى" }, { status: 502 }); }
  }
  if (process.env.NODE_ENV === "production" || process.env.MOYASAR_LIVE_MODE === "true") {
    return NextResponse.json({ error: "بوابة الدفع غير مهيأة حاليًا" }, { status: 503 });
  }
  const paymentUrl = `${baseUrl()}/checkout/test?paymentId=${encodeURIComponent(paymentId)}`;
  await prisma.subscriptionPayment.create({ data: { id: paymentId, tenantId: user.tenantId, amount: plan.monthlyPrice, status: "قيد الانتظار", moyasarId: `test_${paymentId}`, paymentUrl, createdAt: new Date().toISOString() } });
  return NextResponse.json({ paymentUrl });
}
