import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getIntegrationSettings, getTenantIntegrationId } from "@/lib/database";
import { prisma } from "@/lib/prisma";

type OAuthCookie = { state: string; tenantId: string };

function dashboardRedirect(request: NextRequest, result: "connected" | "error") {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  return NextResponse.redirect(`${appUrl}/dashboard?view=settings&channel=email&gmail=${result}`);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookie = request.cookies.get("audiencew_gmail_oauth")?.value;

  if (!user || !code || !state || !cookie) return dashboardRedirect(request, "error");

  let oauthCookie: OAuthCookie;
  try {
    oauthCookie = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")) as OAuthCookie;
  } catch {
    return dashboardRedirect(request, "error");
  }

  if (oauthCookie.state !== state || oauthCookie.tenantId !== user.tenantId) {
    return dashboardRedirect(request, "error");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return dashboardRedirect(request, "error");

  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/email/google/callback`,
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");

    const tokenData = (await tokenResponse.json()) as { access_token?: string; refresh_token?: string };
    if (!tokenData.access_token) throw new Error("Google access token is missing");

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!profileResponse.ok) throw new Error("Google profile request failed");

    const profile = (await profileResponse.json()) as { email?: string; name?: string };
    if (!profile.email) throw new Error("Google email is missing");

    const current = await getIntegrationSettings("email", user.tenantId);
    const refreshToken = tokenData.refresh_token || current.googleRefreshToken;
    if (!refreshToken) throw new Error("Google refresh token is missing");

    await prisma.integrationSetting.upsert({
      where: { id: getTenantIntegrationId("email", user.tenantId) },
      create: {
        id: getTenantIntegrationId("email", user.tenantId),
        provider: "gmail",
        status: "connected",
        businessName: profile.name || profile.email,
        wabaName: profile.email,
        phoneNumber: profile.email,
        phoneNumberId: "",
        wabaId: "",
        appId: "",
        configId: "",
        verifyToken: "",
        accessToken: "",
        webhookUrl: "/api/email/inbound",
        updatedAt: new Date().toISOString(),
        googleRefreshToken: refreshToken
      },
      update: {
        provider: "gmail",
        status: "connected",
        businessName: profile.name || profile.email,
        wabaName: profile.email,
        phoneNumber: profile.email,
        googleRefreshToken: refreshToken,
        updatedAt: new Date().toISOString()
      }
    });

    const response = dashboardRedirect(request, "connected");
    response.cookies.delete("audiencew_gmail_oauth");
    return response;
  } catch (error) {
    console.error("Gmail OAuth callback failed", error);
    const response = dashboardRedirect(request, "error");
    response.cookies.delete("audiencew_gmail_oauth");
    return response;
  }
}
