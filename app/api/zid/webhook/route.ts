import { NextRequest, NextResponse } from "next/server";
import { handleZidWebhook } from "../../../../lib/store-engine";
import { verifyZidWebhook, ZID_EVENTS } from "../../../../lib/zid";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Zid's events (order created / status updated, abandoned cart). The workspace and event come from the
 * signed query string we registered when the store was connected - nothing in the body is trusted for identity.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("t") || "";
  const event = request.nextUrl.searchParams.get("e") || "";
  const signature = request.nextUrl.searchParams.get("s") || "";
  if (!(ZID_EVENTS as readonly string[]).includes(event) || !verifyZidWebhook(tenantId, event, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }
  const limit = await consumeRateLimit("zid-webhook", requestIdentifier(request, tenantId), 600, 60_000);
  if (!limit.allowed) return NextResponse.json({ ok: true, detail: "rate-limited" }, { status: 429 });

  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const outcome = await handleZidWebhook(tenantId, event, body);
  return NextResponse.json({ ok: outcome.handled, detail: outcome.detail }, { status: outcome.status });
}
