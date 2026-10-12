import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { createOAuthState } from "../../../../lib/oauth-state";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";

export const runtime = "nodejs";

// The same Meta app as the WhatsApp connection (see app/api/meta/connect), so the redirect URI
// /api/meta/callback is already registered with Meta; the callback tells this flow apart by `channel`.
const metaAppId = process.env.META_ADS_APP_ID || "1296230909161568";

/** Starts "Sign in with Meta" to choose the ad account and dataset (pixel). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));
  if (user.role !== "مالك الحساب") {
    return new NextResponse(
      popupCloseHtml(getAppOrigin(request), "ربط إعلانات ميتا متاح لمالك الحساب فقط.", { type: "audiencew:meta-connected" }, "/dashboard?view=integrations"),
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  const oauthState = createOAuthState("meta", { channel: "meta_ads" });
  const url = new URL("https://www.facebook.com/v22.0/dialog/oauth");
  url.searchParams.set("client_id", metaAppId);
  url.searchParams.set("redirect_uri", `${getAppOrigin(request)}/api/meta/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", oauthState.state);
  url.searchParams.set("scope", "ads_management,ads_read,business_management");

  const response = NextResponse.redirect(url);
  response.cookies.set("audiencew_meta_state", oauthState.nonce, {
    httpOnly: true,
    maxAge: oauthState.maxAgeSeconds,
    path: "/api/meta",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  return response;
}
