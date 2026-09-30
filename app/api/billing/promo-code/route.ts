import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { computeProrationCredit } from "../../../../lib/subscriptions";
import { validatePromoCode, promoCodeErrorMessage } from "../../../../lib/promo-codes";

export const runtime = "nodejs";

/**
 * Checkout page Apply button: a read-only preview only, no reservation is
 * made here. The authoritative check that actually consumes a usage slot
 * happens in /api/billing/checkout at the moment the payment row is
 * staged, so a preview here can never itself cause a false consumption.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "إدارة الاشتراك متاحة لمالك الحساب" }, { status: 403 });

  const { planId, code } = await request.json().catch(() => ({})) as { planId?: string; code?: string };
  if (!planId || !code) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  await ensureSchema();
  const plan = await prisma.plan.findFirst({ where: { id: planId, active: 1 } });
  if (!plan) return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 404 });

  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  const proration = computeProrationCredit({
    now: new Date(),
    currentStatus: subscription?.status,
    currentPlan: subscription?.plan,
    currentAmount: subscription?.amount,
    currentRenewalAt: subscription?.renewalAt,
    newPlanName: plan.name,
    newPlanPrice: plan.monthlyPrice
  });
  const amountSar = proration.creditAmount > 0 ? proration.finalAmount : plan.monthlyPrice;

  const result = await validatePromoCode({
    code,
    tenantId: user.tenantId,
    planId: plan.id,
    planName: plan.name,
    amountSar
  });

  if (!result.ok) {
    return NextResponse.json({ error: promoCodeErrorMessage(result.errorCode, "ar") }, { status: 400 });
  }

  return NextResponse.json({
    code: result.discountCode.code,
    subtotal: amountSar,
    discountAmount: result.discountAmount,
    finalAmount: result.finalAmount
  });
}
