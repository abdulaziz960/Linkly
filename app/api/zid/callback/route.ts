import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { verifyOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";
import { exchangeZidCode, fetchZidStore, subscribeZidWebhooks, unpackZidToken, zidRedirectUri } from "../../../../lib/zid";
import { saveStoreTokens } from "../../../../lib/store-connections";

export const runtime = "nodejs";

function closeWith(request: NextRequest, message: string) {
  const response = new NextResponse(
    popupCloseHtml(getAppOrigin(request), message, { type: "linkly:store-connected" }, "/dashboard?view=integrations"),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
  response.cookies.delete("linkly_zid_state");
  return response;
}

/** Zid sends the owner back here with a code, which becomes the store's tokens; then we subscribe to its events. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"), "zid", request.cookies.get("linkly_zid_state")?.value);
  const code = request.nextUrl.searchParams.get("code") || "";
  if (!state || state.tenantId !== user.tenantId) return closeWith(request, "تعذر التحقق من طلب الربط. حاول مرة أخرى.");
  if (user.role !== "مالك الحساب") return closeWith(request, "ربط المتجر متاح لمالك الحساب فقط.");
  if (!code) return closeWith(request, "لم تتم الموافقة على الربط.");

  const origin = getAppOrigin(request);
  const tokens = await exchangeZidCode(code, zidRedirectUri(origin));
  if ("error" in tokens) return closeWith(request, tokens.error);
  const pair = unpackZidToken(tokens.token);
  const store = pair ? await fetchZidStore(pair) : null;
  await saveStoreTokens({ tenantId: user.tenantId, store: "zid", accessToken: tokens.token, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, merchantId: store?.id ?? "", merchantName: store?.name ?? "" });

  const subscriptions = await subscribeZidWebhooks(user.tenantId, origin).catch(() => ({ accepted: 0, failed: 3 }));
  if (subscriptions.accepted === 0) {
    return closeWith(request, "تم ربط متجر زد، لكن تعذر تفعيل استقبال الطلبات تلقائيًا. تواصل مع الدعم.");
  }
  return closeWith(request, store?.id ? "تم ربط متجر زد بنجاح." : "تم الربط، لكن تعذر التعرّف على المتجر. أعد المحاولة إن لم تصل الإشعارات.");
}
