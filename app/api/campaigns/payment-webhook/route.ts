import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { verifyMoyasarWebhookSecret } from "../../../../lib/moyasar";

export const runtime = "nodejs";

/**
 * Moyasar posts invoice status changes here. Nothing fires until
 * MOYASAR_WEBHOOK_SECRET is set and matches the secret configured on the
 * Moyasar dashboard side - see lib/moyasar.ts.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    type?: string;
    secret_token?: string;
    data?: { id?: string; invoice_id?: string; status?: string; metadata?: Record<string, string> };
  } | null;

  if (!body || !verifyMoyasarWebhookSecret(body.secret_token)) {
    console.error("[moyasar:campaigns-webhook] rejected", JSON.stringify({ ...body, secret_token: body?.secret_token ? "[present]" : "[missing]" }));
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  // The account-level "Payments Webhooks" fire on Payment resources, not
  // Invoice resources - data.id is the payment's own id, while data.invoice_id
  // is the invoice id we actually stored as moyasarId.
  const invoiceId = body.data?.invoice_id || body.data?.id;
  const status = body.data?.status;
  if (!invoiceId || status !== "paid") {
    console.error("[moyasar:campaigns-webhook] skipped - not a paid invoice event", JSON.stringify(body));
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
