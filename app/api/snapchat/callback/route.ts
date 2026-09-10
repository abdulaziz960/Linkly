import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { getSnapchatRedirectUri, snapchatClientId, snapchatClientSecret, getMyAdAccountInfo } from "../../../../lib/snapchat";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";
import { getAppOrigin } from "../../../../lib/app-url";

export const runtime = "nodejs";

type SnapchatTokenPayload = {
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
  const savedState = request.cookies.get("audiencew_snapchat_state")?.value;
  const redirectTo = new URL("/dashboard", getAppOrigin(request));
  redirectTo.searchParams.set("view", "settings");
  redirectTo.searchParams.set("channel", "snapchat");

  if (!code || !state || state !== savedState) {
    redirectTo.searchParams.set("snapchat", "invalid-state");
    return NextResponse.redirect(redirectTo);
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", getAppOrigin(request)));

  const clientId = snapchatClientId();
  const clientSecret = snapchatClientSecret();
  if (!clientId || !clientSecret) {
    redirectTo.searchParams.set("snapchat", "missing-credentials");
    return NextResponse.redirect(redirectTo);
  }

  const settings = await getIntegrationSettings("snapchat", user.tenantId);
  const redirectUri = getSnapchatRedirectUri(request);
  const tokenResponse = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
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
  const tokenPayload = await tokenResponse.json().catch(() => null) as SnapchatTokenPayload | null;

  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    redirectTo.searchParams.set("snapchat", "token-error");
    return NextResponse.redirect(redirectTo);
  }

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: user.tenantId },
    data: {
      provider: "snapchat",
      accessToken: encryptSecret(tokenPayload.access_token),
      snapchatRefreshToken: tokenPayload.refresh_token ? encryptSecret(tokenPayload.refresh_token) : settings.snapchatRefreshToken,
      snapchatTokenExpiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 3600) * 1000).toISOString(),
      updatedAt: updatedAt()
    }
  });

  let status: "connected" | "pending" = "pending";
  try {
    const refreshedSettings = await getIntegrationSettings("snapchat", user.tenantId);
    const adAccount = await getMyAdAccountInfo(refreshedSettings);
    if (adAccount) {
      await prisma.integrationSetting.updateMany({
        where: { id: settings.id, tenantId: user.tenantId },
        data: {
          status: "connected",
          snapchatAdAccountId: adAccount.id,
          snapchatOrganizationId: adAccount.organizationId,
          snapchatOrgName: adAccount.organizationName || adAccount.name,
          businessName: adAccount.organizationName || adAccount.name,
          updatedAt: updatedAt()
        }
      });
      status = "connected";
    }
  } catch (error) {
    console.error("Snapchat callback: failed to read ad account info", error);
  }

  redirectTo.searchParams.set("snapchat", status);
  return NextResponse.redirect(redirectTo);
}
