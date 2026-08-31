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
    // Temporary diagnostic: we've seen both a 401 and a 200 arrive for the
    // same payment within milliseconds of each other, and the 200 one
    // didn't apply the payment - logging the raw shape (minus the secret
    // itself) settles whether this is a secret mismatch, a differently-named
    // status field, or an id that doesn't match what we stored.
    console.error("[moyasar:subscriptions-webhook] rejected", JSON.stringify({ ...body, secret_token: body?.secret_token ? "[present]" : "[missing]" }));
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  await ensureSchema();
  const invoiceId = body.data?.id;
  const status = body.data?.status;
  if (!invoiceId || status !== "paid") {
    console.error("[moyasar:subscriptions-webhook] skipped - not a paid invoice event", JSON.stringify(body));
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payment = await prisma.subscriptionPayment.findFirst({ where: { moyasarId: invoiceId } });
  if (!payment) {
    console.error(`[moyasar:subscriptions-webhook] no SubscriptionPayment found for moyasarId=${invoiceId}`);
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
