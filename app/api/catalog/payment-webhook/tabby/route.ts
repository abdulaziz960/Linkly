import { NextRequest, NextResponse } from "next/server";
import { getProviderConfig } from "../../../../../lib/payments/config";
import { handleProviderNotification, secretMatches } from "../../../../../lib/payments/webhook";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Tabby's payment notifications for one workspace (`?t=<tenant>`), signed with the secret we registered in `X-Auth-Key`.
 * Only the payment id is read from the body; the payment is re-read from Tabby before anything changes.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("t") || "";
  const limit = await consumeRateLimit("tabby-webhook", requestIdentifier(request, tenantId), 120, 5 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ ok: true });

  const { config } = await getProviderConfig(tenantId, "tabby");
  if (!secretMatches(request.headers.get("x-auth-key"), config.webhookSecret ?? "")) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const paymentId = typeof body?.id === "string" ? body.id : "";
  const result = await handleProviderNotification(tenantId, paymentId ? `tabby-${paymentId}` : "");
  return NextResponse.json(result.body, { status: result.status });
}
