import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { fetchMoyasarInvoice, verifyMoyasarWebhookSecret } from "../../../../../lib/moyasar";
import { applyConfirmedSubscriptionPayment, logAdminAction } from "../../../../../lib/subscriptions";

export const runtime = "nodejs";

/**
 * Moyasar posts invoice status changes here. Two different notification
 * shapes hit this same URL: the account-level "Payments Webhooks" (carries
 * secret_token, status nested under `data`) which requires MOYASAR_WEBHOOK_SECRET
 * to be set and matching on the Moyasar dashboard side, and the invoice's
 * own callback_url (set by us at invoice-creation time, so it always
 * exists) which delivers the raw invoice object with no secret_token at
 * all. Relying solely on the former meant a paid invoice never got applied
 * whenever that dashboard-side webhook was missing, disabled, or
 * misconfigured - so regardless of which shape arrives, and regardless of
 * whether secret_token was present, we take only the invoice id from the
 * payload and ask Moyasar directly (with our own secret key) what its real
 * status is, rather than ever trusting a webhook body's own `status` field.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    secret_token?: string;
    id?: string;
    invoice_id?: string;
    data?: { id?: string; invoice_id?: string; status?: string };
  } | null;

  if (body?.secret_token && !verifyMoyasarWebhookSecret(body.secret_token)) {
    console.error("[moyasar:subscriptions-webhook] rejected - secret_token mismatch");
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  await ensureSchema();
  const invoiceId = body?.data?.invoice_id || body?.data?.id || body?.invoice_id || body?.id;
  if (!invoiceId) {
    console.error("[moyasar:subscriptions-webhook] skipped - no invoice id", JSON.stringify(body));
    return NextResponse.json({ ok: true, skipped: true });
  }

  const verifiedInvoice = await fetchMoyasarInvoice(invoiceId);
  const status = verifiedInvoice?.status;
  if (!status) {
    console.error(`[moyasar:subscriptions-webhook] could not verify invoice status for ${invoiceId} against Moyasar`);
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
