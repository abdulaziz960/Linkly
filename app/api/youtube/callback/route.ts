import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { getYoutubeRedirectUri, youtubeClientId, youtubeClientSecret, getMyChannelInfo } from "../../../../lib/youtube";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

type GoogleTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function updatedAt() {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("audiencew_youtube_state")?.value;
  const redirectTo = new URL("/dashboard", getAppOrigin(request));
  redirectTo.searchParams.set("view", "settings");
  redirectTo.searchParams.set("channel", "youtube");

  if (!code || !state || state !== savedState) {
    redirectTo.searchParams.set("youtube", "invalid-state");
    return NextResponse.redirect(redirectTo);
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  const clientId = youtubeClientId();
  const clientSecret = youtubeClientSecret();
  if (!clientId || !clientSecret) {
    redirectTo.searchParams.set("youtube", "missing-credentials");
    return NextResponse.redirect(redirectTo);
  }

  const settings = await getIntegrationSettings("youtube", user.tenantId);
  const redirectUri = getYoutubeRedirectUri(request);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const tokenPayload = await tokenResponse.json().catch(() => null) as GoogleTokenPayload | null;

  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    redirectTo.searchParams.set("youtube", "token-error");
    return NextResponse.redirect(redirectTo);
  }

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: user.tenantId },
    data: {
      provider: "youtube",
      accessToken: encryptSecret(tokenPayload.access_token),
      youtubeRefreshToken: encryptSecret(tokenPayload.refresh_token || settings.youtubeRefreshToken),
      youtubeTokenExpiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 3600) * 1000).toISOString(),
      updatedAt: updatedAt()
    }
  });

  let status: "connected" | "pending" = "pending";
  try {
    const refreshedSettings = await getIntegrationSettings("youtube", user.tenantId);
    const channel = await getMyChannelInfo(refreshedSettings);
    if (channel) {
      await prisma.integrationSetting.updateMany({
        where: { id: settings.id, tenantId: user.tenantId },
        data: {
          status: "connected",
          youtubeChannelId: channel.id,
          youtubeChannelTitle: channel.title,
          businessName: channel.title,
          updatedAt: updatedAt()
        }
      });
      status = "connected";
    }
  } catch (error) {
    console.error("YouTube callback: failed to read channel info", error);
  }

  redirectTo.searchParams.set("youtube", status);
  return NextResponse.redirect(redirectTo);
}
