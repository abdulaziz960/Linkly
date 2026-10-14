import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { createOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";
import { normalizeShopDomain, shopifyAuthorizeUrl, shopifyConfigured, shopifyRedirectUri, verifyShopifyQuery } from "../../../../lib/shopify";

export const runtime = "nodejs";

function closeWith(request: NextRequest, message: string) {
  return new NextResponse(
    popupCloseHtml(getAppOrigin(request), message, { type: "linkly:store-connected" }, "/dashboard?view=integrations"),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

/**
 * Starts "Connect Shopify". A Shopify OAuth always goes to one specific shop, so the shop comes with the
 * request: from our screen (?shop=my-store) or from Shopify's own install link, which is signed (hmac)
 * and is verified before it is trusted.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("hmac") && !verifyShopifyQuery(params)) return closeWith(request, "تعذر التحقق من طلب التثبيت من شوبيفاي.");

  const user = await getCurrentUser();
  if (!user) return closeWith(request, "سجّل الدخول إلى لنكلي أولًا، ثم اربط المتجر من: التكاملات ← شوبيفاي ← ربط المتجر.");
  if (user.role !== "مالك الحساب") return closeWith(request, "ربط المتجر متاح لمالك الحساب فقط.");
  if (!shopifyConfigured()) return closeWith(request, "ربط شوبيفاي غير مفعّل بعد على الخادم (بيانات التطبيق ناقصة).");

  const shop = normalizeShopDomain(params.get("shop") || "");
  if (!shop) return closeWith(request, "أدخل نطاق المتجر بالشكل: my-store.myshopify.com");

  const state = createOAuthState("shopify", { tenantId: user.tenantId, shop });
  const response = NextResponse.redirect(shopifyAuthorizeUrl(shop, state.state, shopifyRedirectUri(getAppOrigin(request))));
  response.cookies.set("linkly_shopify_state", state.nonce, {
    httpOnly: true,
    maxAge: state.maxAgeSeconds,
    path: "/api/shopify",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  return response;
}
