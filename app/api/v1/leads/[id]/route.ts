import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getApiLead } from "../../../../../lib/developer-api";
import { consumeRateLimit } from "../../../../../lib/rate-limit";
import { withCors } from "../../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request);
  if (!auth) return withCors(NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 }));

  const rateLimit = await consumeRateLimit("public-api", auth.rawKey, 60, 60_000);
  if (!rateLimit.allowed) {
    return withCors(NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }));
  }

  const { id } = await params;
  const lead = await getApiLead(auth.tenantId, id);
  if (!lead) return withCors(NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 }));

  return withCors(NextResponse.json({ ok: true, data: lead }));
}
