import { NextRequest, NextResponse } from "next/server";
import { getProviderConfig } from "../../../../../lib/payments/config";
import { handleProviderNotification, secretMatches } from "../../../../../lib/payments/webhook";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Tamara's order notifications for one workspace (`?t=<tenant>`), carrying the secret we registered in `authorization`.
 * Only Tamara's order id is read from the body; the order is re-read from Tamara before anything changes.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("t") || "";
  const limit = await consumeRateLimit("tamara-webhook", requestIdentifier(request, tenantId), 120, 5 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ ok: true });

  const { config } = await getProviderConfig(tenantId, "tamara");
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!secretMatches(received, config.webhookSecret ?? "")) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { order_id?: unknown } | null;
  const orderId = typeof body?.order_id === "string" ? body.order_id : "";
  const result = await handleProviderNotification(tenantId, orderId ? `tamara-${orderId}` : "");
  return NextResponse.json(result.body, { status: result.status });
}
