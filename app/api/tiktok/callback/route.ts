import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";
import { getAppOrigin } from "../../../../lib/app-url";
import { popupCloseHtml } from "../../../../lib/popup-close";

export const runtime = "nodejs";

function closePopup(origin: string, message: string) {
  return new NextResponse(
    popupCloseHtml(origin, message, { type: "audiencew:meta-connected" }, "/dashboard?meta=tiktok-callback&view=settings"),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code") || "";
  const state = searchParams.get("state") || "";
  const origin = getAppOrigin(request);

  const savedState = request.cookies.get("tiktok_oauth_state")?.value || "";
  const codeVerifier = request.cookies.get("tiktok_oauth_verifier")?.value || "";

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    return closePopup(origin, "تعذر التحقق من الطلب. أغلق النافذة وحاول من جديد.");
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
  const redirectUri = `${origin}/api/tiktok/callback`;

  const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });
  const tokenPayload = await tokenResponse.json().catch(() => null) as {
    access_token?: string;
    open_id?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    console.error("TikTok token exchange failed", tokenPayload);
    return closePopup(origin, "فشل تسجيل الدخول عبر TikTok. أغلق النافذة وحاول من جديد.");
  }

  const accessToken = tokenPayload.access_token;
  const openId = tokenPayload.open_id || "";

  const userInfoUrl = new URL("https://open.tiktokapis.com/v2/user/info/");
  userInfoUrl.searchParams.set("fields", "open_id,display_name,avatar_url,username");
  const userInfoResponse = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const userInfoPayload = await userInfoResponse.json().catch(() => null) as {
    data?: { user?: { open_id?: string; display_name?: string; username?: string } };
  } | null;
  const account = userInfoPayload?.data?.user;

  const user = await getCurrentUser();
  if (!user) return closePopup(origin, "انتهت جلستك. سجّل الدخول من جديد وحاول الربط مرة أخرى.");

  const settings = await getIntegrationSettings("tiktok", user.tenantId);

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: user.tenantId },
    data: {
      status: "connected",
      wabaId: account?.open_id || openId || settings.wabaId,
      wabaName: account?.display_name || account?.username || settings.wabaName,
      accessToken: encryptSecret(accessToken),
      updatedAt: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Riyadh",
        numberingSystem: "latn",
        calendar: "gregory"
      }).format(new Date())
    }
  });

  const response = closePopup(origin, "تم تسجيل الدخول. سيتم إغلاق النافذة...");
  response.cookies.delete("tiktok_oauth_state");
  response.cookies.delete("tiktok_oauth_verifier");
  return response;
}
