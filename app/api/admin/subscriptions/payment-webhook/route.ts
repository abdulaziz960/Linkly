import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { verifyMoyasarWebhookSecret } from "../../../../../lib/moyasar";
import { applyConfirmedSubscriptionPayment, logAdminAction } from "../../../../../lib/subscriptions";

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
  if (!payment) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  const subscription = await prisma.subscription.findUnique({ where: { tenantId: payment.tenantId } });
  if (subscription) {
    const { activated } = await applyConfirmedSubscriptionPayment(payment.id);
    if (!activated) return NextResponse.json({ ok: true, alreadyProcessed: true });

    await logAdminAction(payment.tenantId, subscription.companyName, `تم استلام دفعة اشتراك بقيمة ${payment.amount} ر.س عبر Moyasar، وتم تجديد الاشتراك.`);
  } else {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
