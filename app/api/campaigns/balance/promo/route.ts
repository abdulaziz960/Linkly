import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { calculateChargeAmount } from "../../../../../lib/campaign-engine";
import { setCampaignPaymentPromo } from "../../../../../lib/promo-codes";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** Promo box on the campaign top-up payment page (general codes only - see validatePromoCode). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const limit = await consumeRateLimit("pay-promo", requestIdentifier(request, user.id), 20, 15 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة، حاول لاحقًا", 429);

  const { paymentId, code } = await request.json().catch(() => ({})) as { paymentId?: string; code?: string };
  if (!paymentId || typeof code !== "string") return jsonError("بيانات غير صالحة", 400);

  const payment = await prisma.campaignPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId }, select: { messages: true } });
  const baseAmount = payment ? calculateChargeAmount(payment.messages) : null;
  if (!payment || !baseAmount) return jsonError("عملية الدفع غير موجودة", 404);

  const result = await setCampaignPaymentPromo(user, paymentId, code, baseAmount);
  if (!result.ok) return jsonError(result.error, result.status);
  return jsonOk({ amount: result.amount, discountAmount: result.discountAmount, code: result.code });
}
