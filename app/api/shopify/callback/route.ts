import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { verifyOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";
import { findTenantByMerchant } from "../../../../lib/store-connections";
import {
  exchangeShopifyCode,
  fetchShopifyShop,
  normalizeShopDomain,
  registerShopifyWebhooks,
  saveShopifyConnection,
  verifyShopifyQuery
} from "../../../../lib/shopify";

export const runtime = "nodejs";

function closeWith(request: NextRequest, message: string) {
  const response = new NextResponse(
    popupCloseHtml(getAppOrigin(request), message, { type: "linkly:store-connected" }, "/dashboard?view=integrations"),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
  response.cookies.delete("linkly_shopify_state");
  return response;
}

/** Shopify sends the owner back here, signed, with a code that becomes the shop's access token. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  // Three checks, all of which must hold: Shopify signed this redirect, it is the flow this browser
  // started (state + cookie), and it is for the shop that flow named.
  if (!verifyShopifyQuery(params)) return closeWith(request, "تعذر التحقق من توقيع شوبيفاي. حاول مرة أخرى.");
  const state = verifyOAuthState(params.get("state"), "shopify", request.cookies.get("linkly_shopify_state")?.value);
  const shop = normalizeShopDomain(params.get("shop") || "");
  if (!state || state.tenantId !== user.tenantId || !shop || state.shop !== shop) return closeWith(request, "تعذر التحقق من طلب الربط. حاول مرة أخرى.");
  if (user.role !== "مالك الحساب") return closeWith(request, "ربط المتجر متاح لمالك الحساب فقط.");
  const code = params.get("code") || "";
  if (!code) return closeWith(request, "لم تتم الموافقة على الربط.");

  // A shop's webhooks are routed to the one workspace that connected it, so a shop already
  // connected elsewhere is not taken over by a second workspace.
  const owner = await findTenantByMerchant("shopify", shop);
  if (owner && owner !== user.tenantId) return closeWith(request, "هذا المتجر مربوط بحساب آخر في لنكلي. افصل الربط هناك أولًا.");

  const tokens = await exchangeShopifyCode(shop, code);
  if ("error" in tokens) return closeWith(request, tokens.error);
  const info = await fetchShopifyShop(shop, tokens.accessToken);
  await saveShopifyConnection(user.tenantId, shop, tokens.accessToken, info?.name || shop);

  const webhooks = await registerShopifyWebhooks(shop, tokens.accessToken, `${getAppOrigin(request)}/api/shopify/webhook`);
  if (webhooks.failed.length) {
    console.error("Shopify webhook registration incomplete", { shop, failed: webhooks.failed });
    return closeWith(request, "تم ربط المتجر، لكن تعذّر تسجيل بعض الأحداث. أعد الربط، وإن استمر فتواصل مع الدعم.");
  }
  return closeWith(request, "تم ربط متجر شوبيفاي بنجاح.");
}
