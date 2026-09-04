import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { fetchMoyasarInvoice, verifyMoyasarWebhookSecret } from "../../../../lib/moyasar";

export const runtime = "nodejs";

/**
 * Moyasar posts invoice status changes here. See
 * app/api/admin/subscriptions/payment-webhook/route.ts for why we verify
 * the invoice's status ourselves against Moyasar's API rather than trusting
 * either notification shape's own `status` field - the account-level
 * "Payments Webhooks" (secret_token required) may be missing or
 * misconfigured on the Moyasar dashboard side, and the invoice's own
 * callback_url has no secret_token to authenticate at all.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    type?: string;
    secret_token?: string;
    id?: string;
    invoice_id?: string;
    data?: { id?: string; invoice_id?: string; status?: string; metadata?: Record<string, string> };
  } | null;

  if (body?.secret_token && !verifyMoyasarWebhookSecret(body.secret_token)) {
    console.error("[moyasar:campaigns-webhook] rejected - secret_token mismatch");
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  const invoiceId = body?.data?.invoice_id || body?.data?.id || body?.invoice_id || body?.id;
  if (!invoiceId) {
    console.error("[moyasar:campaigns-webhook] skipped - no invoice id", JSON.stringify(body));
    return NextResponse.json({ ok: true, skipped: true });
  }

  const verifiedInvoice = await fetchMoyasarInvoice(invoiceId);
  if (verifiedInvoice?.status !== "paid") {
    console.error(`[moyasar:campaigns-webhook] skipped - invoice ${invoiceId} is not paid (status=${verifiedInvoice?.status ?? "unverified"})`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payment = await prisma.campaignPayment.findFirst({ where: { moyasarId: invoiceId } });
  if (!payment) {
    console.error(`[moyasar:campaigns-webhook] no CampaignPayment found for moyasarId=${invoiceId}`);
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  const credited = await prisma.$transaction(async (tx) => {
    const claimed = await tx.campaignPayment.updateMany({
      where: { id: payment.id, status: { not: "مكتمل" } },
      data: { status: "مكتمل", completedAt: new Date().toISOString() }
    });
    if (claimed.count !== 1) return false;
    await tx.campaignBalance.upsert({
      where: { tenantId: payment.tenantId },
      update: { balance: { increment: payment.messages }, updatedAt: new Date().toISOString() },
      create: { tenantId: payment.tenantId, balance: payment.messages, updatedAt: new Date().toISOString() }
    });
    return true;
  });
  if (!credited) return NextResponse.json({ ok: true, alreadyProcessed: true });

  return NextResponse.json({ ok: true });
}
