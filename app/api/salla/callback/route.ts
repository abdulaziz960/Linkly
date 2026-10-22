import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { verifyOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";
import { exchangeSallaCode, fetchSallaMerchant } from "../../../../lib/salla";
import { saveStoreTokens } from "../../../../lib/store-connections";

export const runtime = "nodejs";

function closeWith(request: NextRequest, message: string) {
  console.warn("Salla connect window closing:", message);
  const response = new NextResponse(
    popupCloseHtml(getAppOrigin(request), message, { type: "linkly:store-connected" }, "/dashboard?view=integrations"),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
  response.cookies.delete("linkly_salla_state");
  return response;
}

/** Salla sends the owner back here with a code, which becomes the store's tokens. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"), "salla", request.cookies.get("linkly_salla_state")?.value);
  const code = request.nextUrl.searchParams.get("code") || "";
  if (!state || state.tenantId !== user.tenantId) return closeWith(request, "تعذر التحقق من طلب الربط. حاول مرة أخرى.");
  if (user.role !== "مالك الحساب") return closeWith(request, "ربط المتجر متاح لمالك الحساب فقط.");
  if (!code) return closeWith(request, "لم تتم الموافقة على الربط.");

  const tokens = await exchangeSallaCode(code, `${getAppOrigin(request)}/api/salla/callback`);
  if ("error" in tokens) return closeWith(request, tokens.error);
  const merchant = await fetchSallaMerchant(tokens.accessToken);
  await saveStoreTokens({ tenantId: user.tenantId, store: "salla", accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, merchantId: merchant?.id ?? "", merchantName: merchant?.name ?? "" });
  return closeWith(request, merchant?.id ? "تم ربط متجر سلة بنجاح." : "تم الربط، لكن تعذر التعرّف على المتجر. أعد المحاولة إن لم تصل الإشعارات.");
}
