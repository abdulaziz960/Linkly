import { NextRequest, NextResponse } from "next/server";
import { handleShopifyPrivacyWebhook, handleShopifyWebhook } from "../../../../lib/store-engine";
import { isShopifyShopDomain, verifyShopifyWebhook } from "../../../../lib/shopify";

export const runtime = "nodejs";

const PRIVACY_TOPICS = new Set(["customers/data_request", "customers/redact", "shop/redact"]);

/**
 * Shopify's events and its mandatory privacy webhooks. The body is verified against the app secret
 * (X-Shopify-Hmac-Sha256) before anything is read.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ ok: false }, { status: 413 });
  if (!verifyShopifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") || "";
  const shop = (request.headers.get("x-shopify-shop-domain") || "").trim().toLowerCase();
  if (!topic || !isShopifyShopDomain(shop)) return NextResponse.json({ ok: false, error: "missing topic or shop" }, { status: 400 });

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const outcome = PRIVACY_TOPICS.has(topic) ? await handleShopifyPrivacyWebhook(topic, shop, body) : await handleShopifyWebhook(topic, shop, body);
  return NextResponse.json({ ok: outcome.handled, detail: outcome.detail }, { status: outcome.status });
}
