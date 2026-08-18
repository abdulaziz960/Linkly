import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { calculateChargeAmount } from "../../../../../lib/campaign-engine";
import { createMoyasarInvoice, isMoyasarConfigured } from "../../../../../lib/moyasar";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as { messages?: number };
  const messages = Math.max(0, Math.floor(Number(body.messages) || 0));
  if (messages < 1000) return jsonError("أقل كمية شحن هي 1,000 رسالة");

  const amount = calculateChargeAmount(messages);
  if (!amount) return jsonError("عدد الرسائل خارج نطاق الشرائح المتاحة (حتى 1,000,000 رسالة)");

  if (!isMoyasarConfigured()) {
    return jsonError("بوابة الدفع غير مفعّلة بعد. أضف MOYASAR_SECRET_KEY في متغيرات البيئة لتفعيل الشحن الفعلي.", 503);
  }

  const paymentId = `pay-${Date.now()}`;

  try {
    const invoice = await createMoyasarInvoice({
      amount,
      description: `شحن ${messages.toLocaleString("en-US")} رسالة حملات - AudienceW`,
      callbackUrl: `${baseUrl()}/api/campaigns/payment-webhook`,
      metadata: { tenantId: user.tenantId, messages: String(messages), paymentId }
    });

    await prisma.campaignPayment.create({
      data: {
        id: paymentId,
        tenantId: user.tenantId,
        messages,
        amount,
        status: "قيد الانتظار",
        moyasarId: invoice.id,
        paymentUrl: invoice.url,
        createdAt: new Date().toISOString()
      }
    });

    return jsonOk({ paymentUrl: invoice.url });
  } catch (error) {
    console.error("Moyasar charge request failed", error);
    return jsonError("تعذر إنشاء طلب الدفع، حاول مرة أخرى", 502);
  }
}
