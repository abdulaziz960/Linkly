import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { storeIntegrationBlockedMessage } from "../../../../lib/plan-access-server";
import { createOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";
import { zidAuthorizeUrl, zidConfigured, zidRedirectUri } from "../../../../lib/zid";

export const runtime = "nodejs";

function closeWith(request: NextRequest, message: string) {
  return new NextResponse(
    popupCloseHtml(getAppOrigin(request), message, { type: "linkly:store-connected" }, "/dashboard?view=integrations"),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

/**
 * Starts "Connect Zid": sends the store owner to Zid to approve access. This is also the app's Redirection URL
 * (Zid's install flow begins at the app, which then goes to Zid's authorize page with the callback as redirect_uri).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  // Zid sends a merchant here after "Install" in the App Market. Without a Linkly session there is nobody to
  // attach the store to: say so (the page then lands on the sign-in), rather than a silent bounce.
  if (!user) return closeWith(request, "سجّل الدخول إلى لنكلي أولًا، ثم اربط المتجر من: التكاملات ← زد ← ربط المتجر.");
  if (user.role !== "مالك الحساب") return closeWith(request, "ربط المتجر متاح لمالك الحساب فقط.");
  {
    const blocked = await storeIntegrationBlockedMessage(user.tenantId, "zid");
    if (blocked) return closeWith(request, blocked);
  }
  if (!zidConfigured()) return closeWith(request, "ربط زد غير مفعّل بعد على الخادم (بيانات التطبيق ناقصة).");

  const state = createOAuthState("zid", { tenantId: user.tenantId });
  const response = NextResponse.redirect(zidAuthorizeUrl(state.state, zidRedirectUri(getAppOrigin(request))));
  response.cookies.set("linkly_zid_state", state.nonce, {
    httpOnly: true,
    maxAge: state.maxAgeSeconds,
    path: "/api/zid",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  return response;
}
