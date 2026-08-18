import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { ensureSchema } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { createMoyasarInvoice, isMoyasarConfigured } from "../../../../../lib/moyasar";

export const runtime = "nodejs";

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "لا تملك صلاحية الوصول" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { tenantId?: string; amount?: number } | null;
  const tenantId = body?.tenantId?.trim();
  const amount = Math.max(0, Math.round(Number(body?.amount) || 0));

  if (!tenantId) return NextResponse.json({ ok: false, error: "الحساب مطلوب" }, { status: 400 });
  if (amount < 1) return NextResponse.json({ ok: false, error: "قيمة الفاتورة غير صحيحة" }, { status: 400 });

  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return NextResponse.json({ ok: false, error: "الاشتراك غير موجود" }, { status: 404 });

  if (!isMoyasarConfigured()) {
    return NextResponse.json({ ok: false, error: "بوابة الدفع غير مفعّلة بعد. أضف MOYASAR_SECRET_KEY في متغيرات البيئة لتفعيل الفوترة الفعلية." }, { status: 503 });
  }

  const paymentId = `sub-pay-${Date.now()}`;

  try {
    const invoice = await createMoyasarInvoice({
      amount,
      description: `اشتراك AudienceW - ${subscription.companyName} (${subscription.plan})`,
      callbackUrl: `${baseUrl()}/api/admin/subscriptions/payment-webhook`,
      metadata: { tenantId, paymentId }
    });

    await prisma.subscriptionPayment.create({
      data: {
        id: paymentId,
        tenantId,
        amount,
        status: "قيد الانتظار",
        moyasarId: invoice.id,
        paymentUrl: invoice.url,
        createdAt: new Date().toISOString()
      }
    });

    return NextResponse.json({ ok: true, paymentUrl: invoice.url });
  } catch (error) {
    console.error("Subscription charge request failed", error);
    return NextResponse.json({ ok: false, error: "تعذر إنشاء طلب الدفع، حاول مرة أخرى" }, { status: 502 });
  }
}
