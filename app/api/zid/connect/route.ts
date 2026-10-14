import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
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

/** Starts "Connect Zid": sends the store owner to Zid to approve access. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));
  if (user.role !== "مالك الحساب") return closeWith(request, "ربط المتجر متاح لمالك الحساب فقط.");
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
