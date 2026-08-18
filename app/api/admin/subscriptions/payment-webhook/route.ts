import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { verifyMoyasarWebhookSecret } from "../../../../../lib/moyasar";
import { logAdminAction } from "../../../../../lib/subscriptions";

export const runtime = "nodejs";

/**
 * Moyasar posts invoice status changes here. Nothing fires until
 * MOYASAR_WEBHOOK_SECRET is set and matches the secret configured on the
 * Moyasar dashboard side - see lib/moyasar.ts.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    secret_token?: string;
    data?: { id?: string; status?: string };
  } | null;

  if (!body || !verifyMoyasarWebhookSecret(body.secret_token)) {
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  await ensureSchema();
  const invoiceId = body.data?.id;
  const status = body.data?.status;
  if (!invoiceId || status !== "paid") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payment = await prisma.subscriptionPayment.findFirst({ where: { moyasarId: invoiceId } });
  if (!payment || payment.status === "مكتمل") {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  await prisma.subscriptionPayment.update({
    where: { id: payment.id },
    data: { status: "مكتمل", completedAt: new Date().toISOString() }
  });

  const subscription = await prisma.subscription.findUnique({ where: { tenantId: payment.tenantId } });
  if (subscription) {
    const renewalAt = new Date();
    renewalAt.setMonth(renewalAt.getMonth() + 1);

    await prisma.subscription.update({
      where: { tenantId: payment.tenantId },
      data: {
        status: "نشط",
        renewalAt: renewalAt.toISOString().slice(0, 10),
        updatedAt: new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date())
      }
    });

    await logAdminAction(payment.tenantId, subscription.companyName, `تم استلام دفعة اشتراك بقيمة ${payment.amount} ر.س عبر Moyasar، وتم تجديد الاشتراك.`);
  }

  return NextResponse.json({ ok: true });
}
