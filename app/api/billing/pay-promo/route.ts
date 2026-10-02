import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { setSubscriptionPaymentPromo } from "../../../../lib/promo-codes";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Promo box on the payment page: applies a code to (or, with an empty code,
 * removes it from) the pending subscription payment being paid. The amount
 * is recomputed on the server from the payment row - never from the client.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "إدارة الاشتراك متاحة لمالك الحساب" }, { status: 403 });

  const limit = await consumeRateLimit("pay-promo", requestIdentifier(request, user.id), 20, 15 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "محاولات كثيرة، حاول لاحقًا" }, { status: 429 });

  const { paymentId, code } = await request.json().catch(() => ({})) as { paymentId?: string; code?: string };
  if (!paymentId || typeof code !== "string") return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  const result = await setSubscriptionPaymentPromo(user, paymentId, code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, amount: result.amount, discountAmount: result.discountAmount, code: result.code });
}
