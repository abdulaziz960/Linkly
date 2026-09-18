import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { calculateChargeAmount, calculateChargeAmountHalalas } from "../../../../../lib/campaign-engine";
import { buildPaymentMetadata, isMoyasarConfigured } from "../../../../../lib/moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../../lib/payment-status";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/**
 * Campaign-message top-up: stages a pending CampaignPayment and sends the
 * user to our own embedded card form at /billing/pay/campaign/[paymentId]
 * (same Moyasar.js embedded pattern as the subscription checkout - see
 * app/api/billing/checkout/route.ts). No Moyasar invoice is created up
 * front; the browser creates the actual Moyasar Payment directly with the
 * publishable key, and /api/campaigns/balance/confirm-payment verifies it
 * with our secret key before crediting the balance.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as { messages?: number };
  const messages = Math.max(0, Math.floor(Number(body.messages) || 0));
  if (messages < 1000) return jsonError("أقل كمية شحن هي 1,000 رسالة");

  const amount = calculateChargeAmount(messages);
  const amountHalalas = calculateChargeAmountHalalas(messages);
  if (!amount || !amountHalalas) return jsonError("عدد الرسائل خارج نطاق الشرائح المتاحة (حتى 1,000,000 رسالة)");

  if (!isMoyasarConfigured()) {
    return jsonError("بوابة الدفع غير مفعّلة بعد. أضف MOYASAR_SECRET_KEY في متغيرات البيئة لتفعيل الشحن الفعلي.", 503);
  }

  const paymentId = `pay-${randomUUID()}`;
  // Any employee with the campaigns permission may top up, not only the owner.
  const initiatedBy = user.role === "مالك الحساب" ? "owner" : "member";
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId }, select: { companyName: true } });
  const metadata = buildPaymentMetadata({
    kind: "campaign_topup",
    tenantId: user.tenantId,
    paymentId,
    initiatedBy,
    companyName: subscription?.companyName || user.name,
    messages,
    gateway: PAYMENT_GATEWAY.moyasar
  });

  await prisma.campaignPayment.create({
    data: {
      id: paymentId,
      tenantId: user.tenantId,
      messages,
      amount,
      amountHalalas,
      status: PAYMENT_STATUS.pending,
      createdAt: new Date().toISOString(),
      gateway: PAYMENT_GATEWAY.moyasar,
      gatewayStatus: "initiated",
      initiatedBy,
      metadataJson: JSON.stringify(metadata)
    }
  });

  return jsonOk({ paymentId });
}
