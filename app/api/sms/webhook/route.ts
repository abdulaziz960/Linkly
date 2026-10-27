import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Placeholder endpoint for inbound SMS (replies from customers). Taqnyat's published SMS API covers sending, delivery reports
 * and balance; it documents no incoming-message feed, so nothing is parsed here until Taqnyat confirms how replies are delivered.
 *
 * TODO once Taqnyat confirms how replies are delivered: mirror app/api/telegram/webhook - resolve tenantId from the `tenant`
 * query param and call storeSmsMessage() from lib/sms-inbox.ts with the sender phone number and message body from the real payload.
 */
export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "SMS inbound messaging is not enabled for this deployment."
  }, { status: 501 });
}
