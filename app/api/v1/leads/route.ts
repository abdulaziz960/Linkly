import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, listApiLeads } from "../../../../lib/developer-api";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { withCors } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth) return withCors(NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 }));

  const rateLimit = await consumeRateLimit("public-api", auth.rawKey, 60, 60_000);
  if (!rateLimit.allowed) {
    return withCors(NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }));
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 25));
  const cursor = searchParams.get("cursor") || undefined;

  const data = await listApiLeads(auth.tenantId, { limit, cursor });
  return withCors(NextResponse.json({ ok: true, data }));
}
