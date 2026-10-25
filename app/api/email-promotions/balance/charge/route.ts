import { grossHalalasFromNetHalalas } from "../../../../../lib/vat";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { ensureEmailPromotionsSchema } from "../../../../../lib/email-promotions-schema";
import { calculateEmailPromotionChargeAmount, calculateEmailPromotionChargeAmountHalalas } from "../../../../../lib/email-promotions";
import { buildPaymentMetadata, isMoyasarConfigured } from "../../../../../lib/moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "../../../../../lib/payment-status";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "emailPromotions"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  await ensureEmailPromotionsSchema();

  const body = (await request.json().catch(() => ({}))) as { credits?: number };
  const credits = Math.max(0, Math.floor(Number(body.credits) || 0));
  const amount = calculateEmailPromotionChargeAmount(credits);
  const amountHalalas = calculateEmailPromotionChargeAmountHalalas(credits);

  if (!amount || !amountHalalas) return jsonError("أدخل عدد إيميلات لا يقل عن 1,000");
  if (!isMoyasarConfigured()) return jsonError("بوابة الدفع غير مفعّلة بعد. تواصل مع الدعم لتفعيل الشراء.", 503);

  const paymentId = `pay-email-${randomUUID()}`;
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId }, select: { companyName: true } });
  const initiatedBy = user.role === "مالك الحساب" ? "owner" : "member";
  const metadata = {
    ...buildPaymentMetadata({
      kind: "campaign_topup",
      tenantId: user.tenantId,
      paymentId,
      initiatedBy,
      companyName: subscription?.companyName || user.name,
      messages: credits,
      gateway: PAYMENT_GATEWAY.moyasar
    }),
    product: "Linkly Email Promotions",
    payment_kind: "email_promotions_topup",
    email_credits: String(credits)
  };

  await prisma.campaignPayment.create({
    data: {
      id: paymentId,
      tenantId: user.tenantId,
      messages: credits,
      amount,
      amountHalalas: grossHalalasFromNetHalalas(amountHalalas),
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
