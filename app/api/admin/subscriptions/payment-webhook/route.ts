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
    data?: { id?: string; invoice_id?: string; status?: string };
  } | null;

  if (!body || !verifyMoyasarWebhookSecret(body.secret_token)) {
    // Two different notifications hit this same URL: the account-level
    // "Payments Webhooks" (carries secret_token, data-wrapped - this is the
    // one we actually trust and act on below) and the invoice's own
    // callback_url, which delivers the raw invoice object with no
    // secret_token field at all and can't be verified. The latter is
    // expected and harmless - only log as an error when a secret_token was
    // actually sent and didn't match, since that's the case worth noticing.
    if (body?.secret_token) {
      console.error("[moyasar:subscriptions-webhook] rejected - secret_token mismatch");
    }
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  await ensureSchema();
  // The account-level "Payments Webhooks" fire on Payment resources, not
  // Invoice resources - data.id is the payment's own id, while data.invoice_id
  // is the invoice id we actually stored as moyasarId. Matching on data.id
  // alone meant every delivery landed on "no SubscriptionPayment found" even
  // for a genuinely paid invoice.
  const invoiceId = body.data?.invoice_id || body.data?.id;
  const status = body.data?.status;
  if (!invoiceId) {
    console.error("[moyasar:subscriptions-webhook] skipped - no invoice id", JSON.stringify(body));
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payment = await prisma.subscriptionPayment.findFirst({ where: { moyasarId: invoiceId } });
  if (!payment) {
    console.error(`[moyasar:subscriptions-webhook] no SubscriptionPayment found for moyasarId=${invoiceId}`);
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  // Moyasar's other terminal invoice statuses (failed, canceled, expired,
  // refunded, voided...) all mean this payment is definitely never going to
  // complete - clear it out of "pending" rather than leaving it there
  // forever with no way to tell a stuck invoice from a genuinely failed one.
  if (status !== "paid") {
    if (status && status !== "initiated" && payment.status === "قيد الانتظار") {
      await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status: "منتهي الصلاحية" } });
    }
    console.error("[moyasar:subscriptions-webhook] skipped - not a paid invoice event", JSON.stringify(body));
    return NextResponse.json({ ok: true, skipped: true });
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
