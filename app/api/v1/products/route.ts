import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "../../../../lib/developer-api";
import { cleanProductInput, listProducts, upsertProductByExternalId, type ProductInput } from "../../../../lib/catalog";
import { PlanLimitError } from "../../../../lib/plan-access-server";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { withCors } from "../../_utils/cors";

export const runtime = "nodejs";

const MAX_BATCH = 100;

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

  const data = await listProducts(result.auth!.tenantId, { limit, cursor });
  return withCors(NextResponse.json({ ok: true, data }));
}

/**
 * Creates or updates products by externalId - the merchant website's own id
 * for the product - so a custom-built site can push its catalog (one product
 * or up to 100 per request) and re-send the same product later to update it.
 */
export async function POST(request: NextRequest) {
  const result = await authenticateAndRateLimit(request);
  if (result.error) return result.error;

  const body = (await request.json().catch(() => null)) as (ProductInput & { products?: ProductInput[] }) | null;
  if (!body || typeof body !== "object") return withCors(NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }));

  const items = Array.isArray(body.products) ? body.products : [body];
  if (!items.length) return withCors(NextResponse.json({ ok: false, error: "products must not be empty" }, { status: 400 }));
  if (items.length > MAX_BATCH) return withCors(NextResponse.json({ ok: false, error: `At most ${MAX_BATCH} products per request` }, { status: 400 }));

  const tenantId = result.auth!.tenantId;
  const created: string[] = [];
  const updated: string[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (const [index, item] of items.entries()) {
    const cleaned = item && typeof item === "object" ? cleanProductInput(item) : ({ ok: false, error: "Invalid product" } as const);
    if (!cleaned.ok) {
      errors.push({ index, error: cleaned.error });
      continue;
    }
    if (!cleaned.data.externalId) {
      errors.push({ index, error: "externalId is required" });
      continue;
    }
    try {
      const { product, created: wasCreated } = await upsertProductByExternalId(tenantId, "api", cleaned.data);
      (wasCreated ? created : updated).push(product.id);
    } catch (error) {
      if (!(error instanceof PlanLimitError)) throw error;
      errors.push({ index, error: error.message });
    }
  }

  const status = errors.length && !created.length && !updated.length ? 400 : 200;
  return withCors(NextResponse.json({ ok: status === 200, data: { created: created.length, updated: updated.length, errors } }, { status }));
}
