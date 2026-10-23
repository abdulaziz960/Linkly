import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { storeIntegrationBlockedMessage } from "../../../../lib/plan-access-server";
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
  if (!user) {
    // Shopify's own (signed) install link with nobody signed in to Linkly: the install opens the workspace
    // (lib/shopify-install.ts). Without the signature this is just a visitor, who signs in first.
    const installShop = params.get("hmac") ? normalizeShopDomain(params.get("shop") || "") : "";
    if (installShop && shopifyConfigured()) return startAuthorization(request, installShop, { install: "1", shop: installShop });
    return closeWith(request, "سجّل الدخول إلى لنكلي أولًا، ثم اربط المتجر من: التكاملات ← شوبيفاي ← ربط المتجر.");
  }
  if (user.role !== "مالك الحساب") return closeWith(request, "ربط المتجر متاح لمالك الحساب فقط.");
  {
    const blocked = await storeIntegrationBlockedMessage(user.tenantId, "shopify");
    if (blocked) return closeWith(request, blocked);
  }
  if (!shopifyConfigured()) return closeWith(request, "ربط شوبيفاي غير مفعّل بعد على الخادم (بيانات التطبيق ناقصة).");

  const shop = normalizeShopDomain(params.get("shop") || "");
  if (!shop) return closeWith(request, "أدخل نطاق المتجر بالشكل: my-store.myshopify.com");

  return startAuthorization(request, shop, { tenantId: user.tenantId, shop });
}

function startAuthorization(request: NextRequest, shop: string, values: Record<string, string>) {
  const state = createOAuthState("shopify", values);
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
