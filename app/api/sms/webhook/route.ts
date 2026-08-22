import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Placeholder endpoint for Unifonic's inbound SMS webhook (2-way SMS).
 *
 * Unifonic's full webhook payload reference is behind a login-gated docs
 * portal, so the exact field names for an incoming-message event aren't
 * confirmed yet - guessing them here would silently misparse real
 * messages instead of failing loudly.
 *
 * TODO once verified against a real Unifonic account: mirror
 * app/api/telegram/webhook - resolve tenantId from the `tenant` query
 * param and call storeSmsMessage() from lib/sms-inbox.ts with the
 * sender phone number and message body from the actual payload.
 */
export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "SMS inbound messaging is not enabled for this deployment."
  }, { status: 501 });
}
