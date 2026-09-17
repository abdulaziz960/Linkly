import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { getPaymentCallbackOrigin } from "../../../../../lib/app-url";
import { calculateChargeAmount, calculateChargeAmountHalalas } from "../../../../../lib/campaign-engine";
import { buildPaymentMetadata, createMoyasarInvoice, isMoyasarConfigured, paymentDescription } from "../../../../../lib/moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../../lib/payment-status";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/**
 * Campaign-message top-up: stages a CampaignPayment and sends the user to
 * Moyasar's hosted page. Messages are credited to the tenant's balance only
 * once Moyasar confirms the invoice paid (lib/moyasar-webhook.ts).
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
  const origin = getPaymentCallbackOrigin();
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

  try {
    const invoice = await createMoyasarInvoice({
      amount,
      amountHalalas,
      description: paymentDescription("campaign_topup", { messages }),
      callbackUrl: `${origin}/api/campaigns/payment-webhook`,
      successUrl: `${origin}/dashboard?view=campaigns&tab=balance`,
      backUrl: `${origin}/dashboard?view=campaigns&tab=balance`,
      metadata
    });

    await prisma.campaignPayment.create({
      data: {
        id: paymentId,
        tenantId: user.tenantId,
        messages,
        amount,
        amountHalalas,
        status: PAYMENT_STATUS.pending,
        moyasarId: invoice.id,
        paymentUrl: invoice.url,
        createdAt: new Date().toISOString(),
        gateway: PAYMENT_GATEWAY.moyasar,
        gatewayStatus: invoice.status,
        initiatedBy,
        metadataJson: JSON.stringify(metadata)
      }
    });

    return jsonOk({ paymentUrl: invoice.url });
  } catch (error) {
    console.error("Moyasar charge request failed", error);
    return jsonError("تعذر إنشاء طلب الدفع، حاول مرة أخرى", 502);
  }
}
