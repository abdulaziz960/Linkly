import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../lib/database";
import { processMoyasarInvoiceWebhook, type MoyasarWebhookBody } from "../../../../lib/moyasar-webhook";

export const runtime = "nodejs";

/**
 * Moyasar posts campaign-top-up invoice status changes here. See
 * lib/moyasar-webhook.ts for why the invoice's status and amount are
 * re-fetched from Moyasar rather than trusted from the payload.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as MoyasarWebhookBody;
  await ensureSchema();
  const result = await processMoyasarInvoiceWebhook("campaign_topup", body);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
