import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, listApiCustomers, upsertApiCustomer } from "../../../../lib/developer-api";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { isValidSaudiPhone, isValidDisplayName } from "../../../../lib/validation";
import { withCors } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

async function authenticateAndRateLimit(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth) return { error: withCors(NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 })) };

  const rateLimit = await consumeRateLimit("public-api", auth.rawKey, 60, 60_000);
  if (!rateLimit.allowed) {
    return { error: withCors(NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } })) };
  }

  return { auth };
}

export async function GET(request: NextRequest) {
  const result = await authenticateAndRateLimit(request);
  if (result.error) return result.error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 25));
  const cursor = searchParams.get("cursor") || undefined;

  const data = await listApiCustomers(result.auth!.tenantId, { limit, cursor });
  return withCors(NextResponse.json({ ok: true, data }));
}

export async function POST(request: NextRequest) {
  const result = await authenticateAndRateLimit(request);
  if (result.error) return result.error;

  const body = (await request.json().catch(() => null)) as { phone?: string; name?: string } | null;
  const phone = body?.phone?.trim() || "";
  const name = body?.name?.trim() || "";

  if (!phone || !name) return withCors(NextResponse.json({ ok: false, error: "phone and name are required" }, { status: 400 }));
  if (!isValidSaudiPhone(phone)) return withCors(NextResponse.json({ ok: false, error: "phone must be a valid Saudi mobile number" }, { status: 400 }));
  if (!isValidDisplayName(name)) return withCors(NextResponse.json({ ok: false, error: "name is invalid" }, { status: 400 }));

  const customer = await upsertApiCustomer(result.auth!.tenantId, { phone, name });
  return withCors(NextResponse.json({ ok: true, data: { id: customer.id, name: customer.name, phone: customer.phone } }));
}
