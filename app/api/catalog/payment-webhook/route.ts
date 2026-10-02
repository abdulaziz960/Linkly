import { NextRequest, NextResponse } from "next/server";
import { processOrderPaymentCallback } from "../../../../lib/catalog-payments";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Callback for a merchant's own Moyasar invoice (see lib/catalog-payments.ts).
 * Public by necessity (Moyasar calls it) - and safe because nothing in the
 * body is trusted: only the order id in the URL is used, and the payment is
 * re-verified against Moyasar with the merchant's key before anything changes.
 */
export async function POST(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("o") || "";
  const limit = await consumeRateLimit("catalog-payment-webhook", requestIdentifier(request, orderId), 30, 5 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ ok: true });

  const result = await processOrderPaymentCallback(orderId);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
