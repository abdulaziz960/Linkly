import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getAppOrigin } from "../../../../lib/app-url";
import { createOAuthState } from "../../../../lib/oauth-state";
import { isChannelAllowedForTenant } from "../../../../lib/plan-channel-access";
import { tiktokAdsAppId, tiktokAdsConfigured } from "../../../../lib/tiktok-leads";

export const runtime = "nodejs";

const back = (request: NextRequest, result: string) => NextResponse.redirect(new URL(`/dashboard?view=integrations&tiktok=${result}`, getAppOrigin(request)));

/** Sends the advertiser to TikTok to authorize Linkly's app (TikTok API for Business). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));
  if (!(await userHasViewPermission(user, "settings"))) return back(request, "forbidden");
  if (!(await isChannelAllowedForTenant(user.tenantId, "tiktok"))) return back(request, "plan-upgrade-needed");
  if (!tiktokAdsConfigured()) return back(request, "missing-credentials");

  const oauthState = createOAuthState("tiktok_ads", { tenantId: user.tenantId });
  const authUrl = new URL("https://business-api.tiktok.com/portal/auth");
  authUrl.searchParams.set("app_id", tiktokAdsAppId());
  authUrl.searchParams.set("state", oauthState.state);
  authUrl.searchParams.set("redirect_uri", `${getAppOrigin(request)}/api/tiktok-ads/callback`);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("audiencew_tiktok_ads_state", oauthState.nonce, {
    httpOnly: true,
    maxAge: oauthState.maxAgeSeconds,
    path: "/api/tiktok-ads",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  return response;
}
