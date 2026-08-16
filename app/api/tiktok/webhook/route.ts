import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Placeholder endpoint for TikTok's Business Messaging webhook.
 *
 * TikTok gates this API behind manual "Messaging Partner" approval, and
 * without an approved account we can't verify the real event payload shape,
 * header/signature scheme, or challenge-verification handshake against
 * live docs - guessing field names here would silently produce broken
 * message parsing instead of an obvious error.
 *
 * TODO once TikTok approval is granted: mirror app/api/telegram/webhook or
 * app/api/x/webhook - resolve tenantId from the `tenant` query param,
 * verify the request per TikTok's actual signing scheme, parse the event,
 * and call storeTikTokMessage() from lib/tiktok-inbox.ts.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    note: "TikTok Business Messaging webhook not wired up yet - pending Messaging Partner approval."
  });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    note: "TikTok Business Messaging webhook not wired up yet - pending Messaging Partner approval."
  });
}
