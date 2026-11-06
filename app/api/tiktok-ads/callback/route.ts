import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getAppOrigin } from "../../../../lib/app-url";
import { verifyOAuthState } from "../../../../lib/oauth-state";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { connectTikTokLeads, exchangeTikTokAuthCode, tiktokAdsConfigured } from "../../../../lib/tiktok-leads";

export const runtime = "nodejs";

const back = (request: NextRequest, result: string) => {
  const response = NextResponse.redirect(new URL(`/dashboard?view=integrations&tiktok=${result}`, getAppOrigin(request)));
  response.cookies.delete({ name: "audiencew_tiktok_ads_state", path: "/api/tiktok-ads" });
  return response;
};

/** Without an authorization code this is just a landing page (TikTok's reviewers open the redirect URL directly). */
function landingPage() {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Linkly - ربط تيك توك</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f8f8;color:#0b2b2b"><main style="text-align:center;padding:24px"><h1 style="font-size:22px">ربط تيك توك مع Linkly</h1><p>يبدأ الربط من صفحة التكاملات داخل لوحة التحكم.</p><p><a href="/dashboard?view=integrations">فتح التكاملات / Open Integrations</a></p></main></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/** Where TikTok sends an advertiser back after they authorize Linkly: exchange the code, subscribe to leads, store the connection. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const authCode = params.get("auth_code") || params.get("code") || "";
  if (!authCode) return landingPage();

  const state = verifyOAuthState(params.get("state"), "tiktok_ads", request.cookies.get("audiencew_tiktok_ads_state")?.value);
  if (!state) return back(request, "invalid-state");
  const user = await getCurrentUser();
  if (!user || user.tenantId !== state.tenantId) return back(request, "invalid-state");
  if (!(await userHasViewPermission(user, "settings"))) return back(request, "forbidden");
  if (!tiktokAdsConfigured()) return back(request, "missing-credentials");

  const exchanged = await exchangeTikTokAuthCode(authCode);
  if (!exchanged.ok) {
    console.error("TikTok Ads token exchange failed", exchanged.error);
    return back(request, "token-error");
  }
  if (!exchanged.data.advertiserIds.length) {
    console.error("TikTok Ads authorization returned no ad account");
    return back(request, "no-advertiser");
  }

  const connected = await connectTikTokLeads({ tenantId: user.tenantId, connectedBy: user.name, origin: getAppOrigin(request), accessToken: exchanged.data.accessToken, advertiserIds: exchanged.data.advertiserIds });
  if (!connected.ok) {
    console.error("TikTok Ads lead subscription failed", connected.error);
    return back(request, "subscription-error");
  }
  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم ربط نماذج تيك توك بواسطة ${user.name}.`, "معلومة", "التكاملات");
  return back(request, "connected");
}
