import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/database";
import { processMoyasarInvoiceWebhook, type MoyasarWebhookBody } from "../../../../../lib/moyasar-webhook";

export const runtime = "nodejs";

/**
 * Moyasar posts subscription-invoice status changes here (this URL is the
 * invoice's callback_url at creation time, and may also be configured as
 * the account-level Payments Webhook in the Moyasar dashboard). All
 * verification and side effects live in lib/moyasar-webhook.ts, shared
 * with the campaign top-up webhook, so the two can never drift apart.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as MoyasarWebhookBody;
  await ensureSchema();
  const result = await processMoyasarInvoiceWebhook("subscription", body);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
