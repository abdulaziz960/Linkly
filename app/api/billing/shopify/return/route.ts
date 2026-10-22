import { NextRequest, NextResponse } from "next/server";
import { getAppOrigin } from "../../../../../lib/app-url";
import { confirmShopifyPayment } from "../../../../../lib/shopify-billing";

export const runtime = "nodejs";

/**
 * Shopify sends the owner back here after the approval page. Nothing in the query is trusted: the staged
 * payment is settled from Shopify's own record of the subscription (confirmShopifyPayment), so opening this
 * URL again, or with a forged charge_id, changes nothing.
 */
export async function GET(request: NextRequest) {
  const paymentId = request.nextUrl.searchParams.get("payment") || "";
  const outcome = paymentId ? await confirmShopifyPayment(paymentId) : "unknown";
  const result = outcome === "activated" || outcome === "already" ? "paid" : outcome === "declined" ? "declined" : outcome === "pending" ? "pending" : "failed";
  return NextResponse.redirect(new URL(`/billing?shopify=${result}`, getAppOrigin(request)));
}
