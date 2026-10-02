import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "../../../../../lib/developer-api";
import { deleteProduct } from "../../../../../lib/catalog";
import { consumeRateLimit } from "../../../../../lib/rate-limit";
import { withCors } from "../../../_utils/cors";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** Removes a product by Linkly id OR by the website's own externalId. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authenticateApiRequest(request);
  if (!auth) return withCors(NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 }));

  const rateLimit = await consumeRateLimit("public-api", auth.rawKey, 60, 60_000);
  if (!rateLimit.allowed) {
    return withCors(NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }));
  }

  const removed = await deleteProduct(auth.tenantId, id);
  if (!removed) return withCors(NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 }));
  return withCors(NextResponse.json({ ok: true, data: { id } }));
}
